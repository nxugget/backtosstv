/**
 * Server-only reader for the UptimeRobot monitors behind the public status page.
 *
 * The key comes from `UPTIMEROBOT_API_KEY`, an ordinary server variable, never a `NEXT_PUBLIC_`
 * one: a read-only key still lists every monitor on the account, which is nobody's business but
 * ours. Make it a **read-only** key: the main key can pause and delete monitors, and a status
 * page has no reason to hold one.
 *
 * This speaks the v2 API, which takes the key in the body and is the one a read-only key is
 * documented against. v3 exists and is what UptimeRobot recommends for new integrations, but its
 * authentication is bearer tokens rather than these keys; the day this has to move, it is this one
 * module that moves.
 *
 * The free plan allows ten requests a minute **for the whole account**, so nothing here may run per
 * visitor: the page that calls it is revalidated on a timer, which turns any amount of traffic into
 * one request every few minutes. Getting that wrong would make the status page answer 429, an
 * outage of its own making, reported by the thing meant to report outages.
 */
const ENDPOINT = "https://api.uptimerobot.com/v2/getMonitors";

/** Enough for a service that answers in milliseconds, short enough not to hold the page hostage. */
const TIMEOUT_MS = 8000;

/** How long the page keeps one read before asking again. Matches the page's `revalidate`. */
const REVALIDATE_SECONDS = 300;

/** The windows the page shows. UptimeRobot takes them as days, in one string. */
const RATIO_DAYS = [1, 7, 30] as const;

/** How many of the most recent events to keep. The page is a summary, not a log viewer. */
const MAX_EVENTS = 10;

export type MonitorState = "up" | "down" | "paused" | "unknown";

export interface UptimeEvent {
  /** When it happened, as an ISO instant. */
  at: string;
  /** How long it lasted, in seconds, where the event is one that ended. */
  durationSeconds: number | null;
  kind: "down" | "up" | "started" | "paused" | "unknown";
}

export interface Monitor {
  averageResponseMs: number | null;
  events: readonly UptimeEvent[];
  name: string;
  /** Uptime as a percentage over the last day, week and month. Null when the API did not say. */
  ratios: { day: number | null; month: number | null; week: number | null };
  state: MonitorState;
}

export type UptimeReport =
  /** No key configured. The page says so rather than pretending everything is fine. */
  | { kind: "unconfigured" }
  /** The monitoring service could not be read. Carries why, because that is the useful part. */
  | { kind: "unreachable"; reason: string }
  | { checkedAt: string; kind: "ok"; monitors: readonly Monitor[] };

/** The documented v2 status codes. Anything else is reported as unknown rather than guessed at. */
const STATES = new Map<number, MonitorState>([
  [0, "paused"],
  [1, "unknown"], // Registered, not yet checked.
  [2, "up"],
  [8, "down"], // "Seems down": one failed check, not yet confirmed.
  [9, "down"],
]);

/** The documented v2 log types. */
const EVENT_KINDS = new Map<number, UptimeEvent["kind"]>([
  [1, "down"],
  [2, "up"],
  [98, "started"],
  [99, "paused"],
]);

interface MonitorPayload {
  average_response_time?: string;
  custom_uptime_ratio?: string;
  friendly_name?: string;
  logs?: { datetime?: number; duration?: number; type?: number }[];
  status?: number;
}

interface Payload {
  error?: { message?: string };
  monitors?: MonitorPayload[];
  stat?: string;
}

/** The Next.js server fetch, extended with the options its caching understands. */
type NextFetchInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

/** Injected in tests, like the rate limiter's. */
export type FetchLike = (input: string, init: NextFetchInit) => Promise<Response>;

export async function readUptime(fetchImpl: FetchLike = fetch): Promise<UptimeReport> {
  const key = process.env.UPTIMEROBOT_API_KEY;

  if (key === undefined || key.trim() === "") {
    return { kind: "unconfigured" };
  }

  try {
    const response = await fetchImpl(ENDPOINT, {
      body: new URLSearchParams({
        api_key: key.trim(),
        custom_uptime_ratios: RATIO_DAYS.join("-"),
        format: "json",
        logs: "1",
        response_times: "1",
        response_times_limit: "1",
      }),
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The status alone, never the body: an error body from an API called with a key is the last
      // place that key should be quoted back from.
      return {
        kind: "unreachable",
        reason: `the monitoring API answered ${String(response.status)}`,
      };
    }

    const payload = (await response.json()) as Payload;

    if (payload.stat !== "ok") {
      return { kind: "unreachable", reason: describeFailure(payload) };
    }

    return {
      checkedAt: new Date().toISOString(),
      kind: "ok",
      monitors: (payload.monitors ?? []).map(toMonitor),
    };
  } catch (cause) {
    console.error("Failed to read the uptime monitors", cause);

    return {
      kind: "unreachable",
      reason:
        cause instanceof Error && cause.name === "TimeoutError"
          ? "the monitoring API did not answer in time"
          : "the monitoring API could not be reached",
    };
  }
}

/**
 * What went wrong, in words a reader can act on. UptimeRobot's own message is passed through when
 * there is one, because "api_key not found" is the whole diagnosis and hiding it helps nobody.
 */
function describeFailure(payload: Payload): string {
  const message = payload.error?.message;

  return message === undefined || message === ""
    ? "the monitoring API refused the request"
    : `the monitoring API said: ${message}`;
}

function toMonitor(payload: MonitorPayload): Monitor {
  const [day, week, month] = parseRatios(payload.custom_uptime_ratio);

  return {
    averageResponseMs: parseNumber(payload.average_response_time),
    events: (payload.logs ?? []).slice(0, MAX_EVENTS).map(toEvent),
    name: payload.friendly_name ?? "Monitor",
    ratios: { day, month, week },
    state: STATES.get(payload.status ?? -1) ?? "unknown",
  };
}

function toEvent(log: NonNullable<MonitorPayload["logs"]>[number]): UptimeEvent {
  return {
    // The API reports seconds since the epoch; everything this site shows is an ISO instant.
    at: new Date((log.datetime ?? 0) * 1000).toISOString(),
    durationSeconds: typeof log.duration === "number" ? log.duration : null,
    kind: EVENT_KINDS.get(log.type ?? -1) ?? "unknown",
  };
}

/** `custom_uptime_ratio` is the requested windows in order, as a dash-separated string. */
function parseRatios(value: string | undefined): [number | null, number | null, number | null] {
  const parts = (value ?? "").split("-").map(parseNumber);

  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
