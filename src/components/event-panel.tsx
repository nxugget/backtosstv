"use client";

import Image from "next/image";

import { Countdown } from "@/components/countdown-timer";
import { Noise } from "@/components/noise";
import type { PanelEvent } from "@/lib/events-panel";
import { formatFrequency, formatUtcCalendarDate, formatUtcTime } from "@/lib/format";

interface EventPanelProps {
  emptyMessage: string;
  event: PanelEvent | null;
}

/**
 * The framed panel beside the globe. Its content is swapped in place when the visitor clicks a
 * satellite on the globe.
 */
export function EventPanel({ emptyMessage, event }: EventPanelProps) {
  if (event === null) {
    return (
      <div className="flex h-full flex-col gap-4 border border-edge-soft bg-void/40 p-6">
        <p className="retro-kicker">No transmission</p>
        <p className="text-lg leading-relaxed text-ink-dim">{emptyMessage}</p>
      </div>
    );
  }

  const live = event.kind === "live";
  const title = event.title ?? event.satelliteName;
  const accent = live ? "#ff3b30" : "#ff7a3d";

  return (
    <div className="flex h-full flex-col gap-5 border border-edge-soft bg-void/40 p-6">
      <p className={live ? "retro-kicker retro-pulse" : "retro-kicker"} style={{ color: accent }}>
        {live ? "Transmitting now" : "Next transmission"}
      </p>

      <Countdown
        color={accent}
        prefix={live ? "Ends in" : "Starts in"}
        target={live ? event.endTime : event.startTime}
      />

      {event.imageUrl === null ? null : (
        <div className="relative -mx-6 h-48 overflow-hidden bg-void/60">
          <Image
            alt=""
            className="h-48 w-full object-contain"
            height={192}
            src={event.imageUrl}
            width={320}
          />
          <Noise blendMode="overlay" contrast={0.55} opacity={0.18} size={1.5} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl uppercase leading-tight text-ink sm:text-3xl">{title}</h2>
        <p className="font-mono text-sm text-ink-faint">{event.satelliteName}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-ink-faint">Frequency</dt>
        <dd className="font-mono text-ink">{formatFrequency(event.frequencyMhz)} MHz</dd>

        <dt className="text-ink-faint">Mode</dt>
        <dd className="font-mono text-ink">{event.mode}</dd>

        {event.transmitPowerWatts === null ? null : (
          <>
            <dt className="text-ink-faint">Power</dt>
            <dd className="font-mono text-ink">{String(event.transmitPowerWatts)} W</dd>
          </>
        )}

        {event.imageIntervalSeconds === null ? null : (
          <>
            <dt className="text-ink-faint">Image gap</dt>
            <dd className="font-mono text-ink">{String(event.imageIntervalSeconds)} s</dd>
          </>
        )}

        <dt className="text-ink-faint">Start UTC</dt>
        <dd className="font-mono text-ink">{formatStamp(event.startTime)}</dd>

        <dt className="text-ink-faint">End UTC</dt>
        <dd className="font-mono text-ink">{formatStamp(event.endTime)}</dd>

        <dt className="text-ink-faint">Operator</dt>
        <dd className="flex items-center gap-2 text-ink">
          {event.operatorLogoUrl === null ? null : (
            <Image
              alt=""
              className="h-6 w-6 shrink-0 rounded-full object-contain"
              height={24}
              src={event.operatorLogoUrl}
              width={24}
            />
          )}
          {event.operatorName}
        </dd>
      </dl>

      {event.sourceUrl === null ? null : (
        <a
          className="text-sm text-signal underline"
          href={event.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          source
        </a>
      )}
    </div>
  );
}

function formatStamp(value: string): string {
  return `${formatUtcCalendarDate(value)} ${formatUtcTime(value)} UTC`;
}
