import type { Metadata } from "next";

import { pingCatalogue } from "@/lib/api/catalogue";
import { readUptime, type Monitor, type MonitorState, type UptimeEvent } from "@/lib/uptime";

/**
 * Rebuilt on a timer rather than per request. The monitoring account allows ten requests a minute
 * in total, so a page that called it for every visitor would take itself down under the first bit
 * of attention it got. Five minutes is also finer than the data: the monitors check every five.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Status",
  description: "Whether the BackToSSTV catalogue is answering right now, and how it has held up.",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** How many cells the uptime gauge draws. Twenty is one cell per five percent. */
const GAUGE_CELLS = 20;

export default async function StatusPage() {
  const [catalogue, uptime] = await Promise.all([checkCatalogue(), readUptime()]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <p className="retro-kicker">Service</p>
      <h1 className="mt-1 text-4xl uppercase text-ink sm:text-5xl">Status</h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        Whether the catalogue is answering right now, and how it has held up. The live check below
        is the same one <code className="font-mono text-ink">/api/health</code> runs; the history
        comes from a monitor that calls the API from outside every five minutes.
      </p>

      <section className="mt-12">
        <SectionHeading>Right now</SectionHeading>
        <div className="mt-6 border border-edge-soft bg-panel/40 px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <StateBadge state={catalogue.reachable ? "up" : "down"} />
            <span className="text-xl text-ink">
              {catalogue.reachable
                ? "The catalogue is answering"
                : "The catalogue is not answering"}
            </span>
          </div>
          <p className="mt-2 font-mono text-sm text-ink-faint">
            {catalogue.latencyMs === null
              ? "checked just now"
              : `database round trip ${String(catalogue.latencyMs)} ms · checked just now`}
          </p>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading>History</SectionHeading>
        <UptimeSection report={uptime} />
      </section>
    </main>
  );
}

function UptimeSection({ report }: { report: Awaited<ReturnType<typeof readUptime>> }) {
  if (report.kind === "unconfigured") {
    return (
      <Note>
        No monitor is configured, so there is no history to show. The live check above still speaks
        for itself.
      </Note>
    );
  }

  if (report.kind === "unreachable") {
    return <Note>The history is unavailable: {report.reason}.</Note>;
  }

  if (report.monitors.length === 0) {
    return <Note>The monitoring account has no monitors yet.</Note>;
  }

  return (
    <>
      <ul className="mt-6 space-y-8">
        {report.monitors.map((monitor, index) => (
          // By position: a monitor carries no identifier here, and the list is rendered whole.
          <MonitorCard key={index} monitor={monitor} />
        ))}
      </ul>
      <p className="mt-6 font-mono text-sm text-ink-faint">
        read from the monitor at {formatInstant(report.checkedAt)}
      </p>
    </>
  );
}

function MonitorCard({ monitor }: { monitor: Monitor }) {
  return (
    <li className="border border-edge-soft bg-panel/40 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <StateBadge state={monitor.state} />
        <span className="text-xl text-ink">{monitor.name}</span>
        {monitor.averageResponseMs === null ? null : (
          <span className="font-mono text-sm text-ink-faint">
            {String(Math.round(monitor.averageResponseMs))} ms average
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Ratio label="24 hours" value={monitor.ratios.day} />
        <Ratio label="7 days" value={monitor.ratios.week} />
        <Ratio label="30 days" value={monitor.ratios.month} />
      </dl>

      <Gauge value={monitor.ratios.month} />

      {monitor.events.length === 0 ? (
        <p className="mt-5 text-sm text-ink-faint">Nothing to report.</p>
      ) : (
        <ul className="mt-5 space-y-1 font-mono text-sm">
          {monitor.events.map((event, index) => (
            <Event event={event} key={index} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Ratio({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-sm uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-1 font-mono text-3xl text-signal">
        {value === null ? "n/a" : `${value.toFixed(3)}%`}
      </dd>
    </div>
  );
}

/** The month's figure drawn as a bar, because a wall of percentages reads like a spreadsheet. */
function Gauge({ value }: { value: number | null }) {
  if (value === null) {
    return null;
  }

  const filled = Math.max(0, Math.min(GAUGE_CELLS, Math.round((value / 100) * GAUGE_CELLS)));

  return (
    <p aria-hidden="true" className="mt-4 font-mono text-base tracking-widest text-ok-deep">
      <span className="text-ok">{"█".repeat(filled)}</span>
      {"░".repeat(GAUGE_CELLS - filled)}
    </p>
  );
}

function Event({ event }: { event: UptimeEvent }) {
  const duration = event.durationSeconds === null ? null : formatDuration(event.durationSeconds);

  return (
    <li className="text-ink-dim">
      <span className="text-ink-faint">{formatInstant(event.at)}</span>{" "}
      <span className={event.kind === "down" ? "text-signal" : "text-ink"}>
        {describeEvent(event.kind)}
      </span>
      {duration === null ? null : <span className="text-ink-faint"> · {duration}</span>}
    </li>
  );
}

function StateBadge({ state }: { state: MonitorState }) {
  const label = {
    down: "DOWN",
    paused: "PAUSED",
    unknown: "UNKNOWN",
    up: "UP",
  }[state];
  // Green for up, the site's amber for down. The rest of the site speaks in amber, but a status
  // badge is read in half a second against a convention the reader already has: an amber UP makes
  // somebody stop and check they have understood, which is the opposite of the job.
  const tone = {
    down: "border-signal text-signal",
    paused: "border-edge text-ink-dim",
    unknown: "border-edge text-ink-dim",
    up: "border-ok text-ok",
  }[state];

  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-sm uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="retro-kicker">{children}</h2>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 border border-edge-soft bg-panel/40 px-5 py-4 text-sm text-ink-dim">
      {children}
    </p>
  );
}

async function checkCatalogue(): Promise<{ latencyMs: number | null; reachable: boolean }> {
  try {
    return { latencyMs: await pingCatalogue(), reachable: true };
  } catch (cause) {
    console.error("The status page could not reach the catalogue", cause);

    return { latencyMs: null, reachable: false };
  }
}

function describeEvent(kind: UptimeEvent["kind"]): string {
  return {
    down: "went down",
    paused: "monitoring paused",
    started: "monitoring started",
    unknown: "something happened",
    up: "came back",
  }[kind];
}

/** The same shape the header's clock uses: 17 OCT 2026 · 13:29 UTC. */
function formatInstant(iso: string): string {
  const at = new Date(iso);

  if (Number.isNaN(at.getTime())) {
    return "unknown";
  }

  const day = String(at.getUTCDate()).padStart(2, "0");
  const month = MONTHS[at.getUTCMonth()] ?? "???";

  return `${day} ${month} ${String(at.getUTCFullYear())} · ${at.toISOString().slice(11, 16)} UTC`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${String(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);

  return `${String(hours)}h ${String(minutes % 60)}m`;
}
