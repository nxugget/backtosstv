import type { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";

/**
 * A per-caller request budget, counted in Redis when `UPSTASH_REDIS_REST_URL`/`_TOKEN` or Vercel
 * KV's `KV_REST_API_URL`/`_TOKEN` are set, and otherwise in Postgres through `count_api_request()`.
 * Postgres is the weaker of the two, being a write in front of the read it protects, but it needs
 * no account anywhere else, so the budget applies from the first deployment.
 *
 * It fails open. A store that is slow, down or answering nonsense lets the request through: this is
 * a cost control, not a security boundary. Row Level Security is what protects the data.
 *
 * Only requests that reach a handler are counted, so anything the CDN serves is free.
 */

const DEFAULT_REQUESTS_PER_MINUTE = 120;
const WINDOW_SECONDS = 60;

/** Long enough to be worth asking, short enough that the API still answers if the store is sick. */
const STORE_TIMEOUT_MS = 1000;

/**
 * A store that hangs costs the whole timeout on every request for as long as it is down, so after a
 * few failures it is left alone for a while. The count lives in the instance, so each one probes on
 * its own: approximate, and enough for a cost control.
 */
const FAILURES_BEFORE_PAUSING = 3;
const PAUSE_MS = 30_000;

let consecutiveFailures = 0;
let pausedUntil = 0;

/** For tests, which need each case to start from a known state. */
export function resetRateLimitBreaker(): void {
  consecutiveFailures = 0;
  pausedUntil = 0;
}

export interface RateLimitResult {
  /** The 429 to return, or null when the caller may proceed. */
  exceeded: NextResponse | null;
  /** Headers describing the budget, to carry on whatever response the handler sends. */
  headers: readonly [string, string][];
}

const ALLOWED_WITHOUT_LIMIT: RateLimitResult = { exceeded: null, headers: [] };

/**
 * Counts one request against a caller and returns its total for the window, or null when the store
 * could not say; in which case the request is allowed.
 */
export type RequestCounter = (client: string) => Promise<number | null>;

export interface RedisConfig {
  token: string;
  url: string;
}

/** Injected in tests. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function rateLimit(
  request: NextRequest,
  counter: RequestCounter = countInConfiguredStore,
): Promise<RateLimitResult> {
  if (Date.now() < pausedUntil) {
    return ALLOWED_WITHOUT_LIMIT;
  }

  const client = clientOf(request);

  if (client === null) {
    return ALLOWED_WITHOUT_LIMIT;
  }

  const limit = readLimit();
  const used = await counter(client);

  if (used === null) {
    return ALLOWED_WITHOUT_LIMIT;
  }

  consecutiveFailures = 0;

  const resetsIn = WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
  const headers: [string, string][] = [
    ["RateLimit-Limit", String(limit)],
    ["RateLimit-Remaining", String(Math.max(0, limit - used))],
    ["RateLimit-Reset", String(resetsIn)],
  ];

  if (used <= limit) {
    return { exceeded: null, headers };
  }

  const response = errorResponse(
    request,
    429,
    "rate_limited",
    `Too many requests. The budget is ${String(limit)} per minute; it resets in ${String(resetsIn)} seconds. Cache the responses: one served from the cache does not reach us and costs nothing, and If-None-Match turns the rest into a 304.`,
  );

  for (const [name, value] of [...headers, ["Retry-After", String(resetsIn)] as const]) {
    response.headers.set(name, value);
  }

  return { exceeded: response, headers };
}

/** A caller key is an address, so anything longer than this is not one. Bounds the stored key. */
const MAX_CLIENT_KEY_LENGTH = 64;

/**
 * Who to count this request against, or null when callers cannot be told apart, which happens on a
 * server run locally but not behind Vercel.
 *
 * `x-vercel-forwarded-for` is read first: Vercel sets both it and `x-forwarded-for` to the address
 * it saw, overwriting whatever the client sent, but only the first of the two survives a proxy of
 * our own being put in front one day. `x-forwarded-for` is then read leftmost-first, which is the
 * client where the platform rewrites the header, and `x-real-ip` last.
 *
 * An unidentifiable caller is not counted, because the alternative is one shared budget: the day a
 * proxy stops setting the header, that would answer 429 to everybody rather than lose the limit.
 */
export function clientOf(request: NextRequest): string | null {
  const candidates = [
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0],
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
  ];

  for (const candidate of candidates) {
    const address = candidate?.trim();

    if (address !== undefined && address !== "") {
      return budgetKeyOf(address);
    }
  }

  return null;
}

/**
 * The key one budget is counted against. For IPv6 that is the /64, not the address: a single
 * subscriber is handed one, and keying on the address would give them 2^64 budgets to rotate
 * through, and 2^64 rows in `api_request_counters` to leave behind.
 */
export function budgetKeyOf(address: string): string {
  const prefix = ipv6NetworkPrefix(address);

  return (prefix === null ? address : `${prefix}::/64`).slice(0, MAX_CLIENT_KEY_LENGTH);
}

/**
 * The first four groups of an IPv6 address, or null for anything that is not plainly one: an IPv4
 * address, an IPv4-mapped form, or a value that does not parse. Those are keyed whole, because
 * truncating something we have not understood is how every caller ends up in one bucket.
 */
function ipv6NetworkPrefix(value: string): string | null {
  // `[2001:db8::1]:443` is how a forwarding proxy writes an address with a port, and `%eth0` is a
  // zone index. Neither is part of the address.
  const bracketed = /^\[([^\]]+)](?::\d+)?$/.exec(value);
  const address = (bracketed?.[1] ?? value).split("%")[0] ?? "";

  if (!address.includes(":") || address.includes(".")) {
    return null;
  }

  const halves = address.toLowerCase().split("::");

  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] === "" ? [] : (halves[0]?.split(":") ?? []);
  const tail = halves.length === 2 && halves[1] !== "" ? (halves[1]?.split(":") ?? []) : [];

  if (![...head, ...tail].every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }

  const filled = halves.length === 2 ? 8 - head.length - tail.length : 0;

  if (filled < 0 || head.length + tail.length + filled !== 8) {
    return null;
  }

  return [...head, ...Array.from({ length: filled }, () => "0"), ...tail].slice(0, 4).join(":");
}

async function countInConfiguredStore(client: string): Promise<number | null> {
  const redis = readRedisConfig();

  return redis === null ? countInPostgres(client) : countInRedis(redis, client, fetch);
}

/**
 * One key per window, so the expiry can be set unconditionally. A single key with a rolling expiry
 * would keep extending itself under constant load and never let a caller back in.
 */
export async function countInRedis(
  redis: RedisConfig,
  client: string,
  fetchImpl: FetchLike,
): Promise<number | null> {
  const windowStartedAt = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const key = `backtosstv:rate:v1:${client}:${String(windowStartedAt)}`;

  try {
    const response = await fetchImpl(`${redis.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      // One round trip. The expiry outlives the window so a clock a second out of step cannot
      // drop a key still being counted against.
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(WINDOW_SECONDS * 2)],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return failed(`Rate limit store answered ${String(response.status)}`);
    }

    const count = readRedisCount(await response.json());

    return count ?? failed("Rate limit store answered something unexpected");
  } catch (cause) {
    return failed(`Rate limit store unreachable: ${String(cause)}`);
  }
}

/** One statement, so two requests arriving together cannot read the same total. */
export async function countInPostgres(client: string): Promise<number | null> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient()
      .rpc("count_api_request", { p_client: client, p_window_seconds: WINDOW_SECONDS })
      // The same deadline Redis gets. A counter that has stopped answering must not hold the read
      // it is protecting; the limiter fails open, so this is one second and then on with it.
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));

    if (error !== null) {
      return failed(`Rate limit counter refused: ${error.message}`);
    }

    return data > 0 ? data : failed("Rate limit counter said nothing");
  } catch (cause) {
    return failed(`Rate limit counter unreachable: ${String(cause)}`);
  }
}

/** Records a failure, pauses the store once there have been a few, and lets the request through. */
function failed(reason: string): null {
  consecutiveFailures += 1;

  if (consecutiveFailures >= FAILURES_BEFORE_PAUSING) {
    pausedUntil = Date.now() + PAUSE_MS;
    consecutiveFailures = 0;
    console.error(`${reason}: pausing the request budget for ${String(PAUSE_MS / 1000)}s`);
  } else {
    console.error(reason);
  }

  return null;
}

/** `[{ "result": 3 }, { "result": 1 }]`, where the first result is the new counter value. */
function readRedisCount(body: unknown): number | null {
  if (!Array.isArray(body) || body.length === 0) {
    return null;
  }

  const first: unknown = body[0];

  if (typeof first !== "object" || first === null || !("result" in first)) {
    return null;
  }

  const { result } = first;

  return typeof result === "number" && Number.isFinite(result) && result > 0 ? result : null;
}

export function readRedisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url === undefined || url === "" || token === undefined || token === "") {
    return null;
  }

  return { token, url };
}

function readLimit(): number {
  const configured = process.env.RATE_LIMIT_PER_MINUTE;

  if (configured === undefined || !/^\d+$/.test(configured)) {
    return DEFAULT_REQUESTS_PER_MINUTE;
  }

  const parsed = Number(configured);

  return parsed > 0 ? parsed : DEFAULT_REQUESTS_PER_MINUTE;
}
