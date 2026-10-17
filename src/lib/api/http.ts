import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Browsers may keep a response for a minute, shared caches for two, and a stale one is served for a
 * few minutes more while the CDN refetches rather than failing.
 *
 * `stale-if-error` is the day after: when the origin answers 5xx or does not answer at all, the CDN
 * keeps serving what it last had rather than passing the failure on. Nobody is paid to watch this
 * deployment at three in the morning, and a day-old schedule is worth more to a client than an
 * error. The response says how old it is, and `cancelled_at` is the only field that goes stale
 * dangerously, which is why a cancellation is also why anyone revalidates.
 */
const CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300, stale-if-error=86400";

/**
 * The dump is a snapshot, so it may be held far longer than a page of events: a browser keeps it
 * five minutes, the shared cache an hour, and a stale copy is served for a day while the origin
 * rebuilds, and a week if the origin is answering nothing at all. Rebuilding it is the most expensive
 * thing this API does, and the answer is the same for everyone, so it should be done as rarely as
 * the data allows.
 */
const DUMP_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=604800";

const LICENSE_NAME = "CC BY 4.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

/** Collections and single resources both carry it, so a client that reads one response knows. */
export const LICENSE = {
  name: LICENSE_NAME,
  url: LICENSE_URL,
  attribution: "SSTV event data from BackToSSTV, licensed CC BY 4.0",
} as const;

export const ERROR_CODES = [
  "invalid_status",
  "invalid_limit",
  "invalid_offset",
  "invalid_since",
  "invalid_start_after",
  "invalid_start_before",
  "invalid_norad_id",
  "invalid_operator",
  "invalid_mode",
  "invalid_cancelled",
  "invalid_id",
  "not_found",
  "rate_limited",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The parameter each failure is about, so a client can point at the field it sent instead of
 * parsing the prose. `null` where the failure is about the request as a whole rather than one of
 * its parameters.
 *
 * Derived from the code rather than repeated at every call site: the two are the same fact said
 * twice, and `Record<ErrorCode, ...>` means a new code cannot be added without deciding this. The
 * one place that overrides it is `/operators/{slug}`, where what the caller sent is a path segment
 * the document calls `slug`.
 */
export const ERROR_PARAMETERS: Record<ErrorCode, string | null> = {
  invalid_status: "status",
  invalid_limit: "limit",
  invalid_offset: "offset",
  invalid_since: "since",
  invalid_start_after: "start_after",
  invalid_start_before: "start_before",
  invalid_norad_id: "norad_id",
  invalid_operator: "operator",
  invalid_mode: "mode",
  invalid_cancelled: "cancelled",
  invalid_id: "id",
  not_found: null,
  rate_limited: null,
  internal_error: null,
};

/**
 * A client-sent id, if it is short and plain enough to put in a log line: an id that reaches the
 * logs is read by whoever is debugging, so it carries no newline, no control character and no
 * length worth truncating. `x-vercel-id` passes the same test and is the value the deployment's own
 * logs carry, which is what makes it worth preferring over a fresh one.
 */
const LOGGABLE_REQUEST_ID = /^[A-Za-z0-9=:._-]{1,200}$/;

/**
 * One id per request, used in the error body, the `X-Request-Id` header and the log line behind a
 * 500, so a consumer reporting "this request failed" names something that can be found.
 *
 * The id is remembered against the request object: the rate limiter, the error body and the log
 * line all ask for it, and a caller that sent no id of its own would otherwise be given a different
 * random one each time.
 */
const requestIds = new WeakMap<NextRequest, string>();

export function requestId(request: NextRequest): string {
  const known = requestIds.get(request);

  if (known !== undefined) {
    return known;
  }

  const sent = request.headers.get("x-request-id") ?? request.headers.get("x-vercel-id");
  const id = sent !== null && LOGGABLE_REQUEST_ID.test(sent) ? sent : randomUUID();

  requestIds.set(request, id);

  return id;
}

export function publicHeaders(): Headers {
  const headers = new Headers();

  // The data is meant to be read from anywhere, including a page served from another domain.
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, If-None-Match, If-Modified-Since");
  headers.set("Access-Control-Expose-Headers", "ETag, Last-Modified, Link, X-Request-Id");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Link", `<${LICENSE_URL}>; rel="license"`);

  return headers;
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: publicHeaders() });
}

/**
 * Answers with the body, or with 304 when the caller already holds it. The validator is a hash of
 * the body itself, which stays correct whatever a handler puts in it.
 *
 * `If-None-Match` is the strong check and wins; `If-Modified-Since` is honoured too, because the
 * preflight has always said it was accepted and a client that sends it deserves the 304 rather
 * than a page it already has.
 */
export function jsonResponse(
  request: NextRequest,
  body: unknown,
  lastModified: string | null,
  extraHeaders: readonly [string, string][] = [],
): NextResponse {
  return cacheableResponse(
    request,
    JSON.stringify(body),
    "application/json",
    lastModified,
    extraHeaders,
  );
}

/**
 * The same conversation for a calendar: the body is small and bounded, so it can be hashed and a
 * client that already holds it gets a 304 rather than the file again. A calendar client refetches
 * on its own schedule, several times a day, and most of those fetches should cost a comparison.
 */
export function calendarResponse(
  request: NextRequest,
  body: string,
  lastModified: string | null,
  extraHeaders: readonly [string, string][] = [],
): NextResponse {
  const response = cacheableResponse(
    request,
    body,
    "text/calendar; charset=utf-8",
    lastModified,
    extraHeaders,
  );

  // Named, so a browser that downloads it rather than handing it to a calendar gives it a name
  // somebody can recognise.
  response.headers.set("Content-Disposition", 'inline; filename="backtosstv.ics"');

  return response;
}

function cacheableResponse(
  request: NextRequest,
  payload: string,
  contentType: string,
  lastModified: string | null,
  extraHeaders: readonly [string, string][],
): NextResponse {
  const etag = `"${createHash("sha256").update(payload).digest("base64url")}"`;
  const headers = publicHeaders();

  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("ETag", etag);

  // The budget headers among these describe one caller, while the response itself is shared: a
  // cache hit carries whatever the caller who filled the cache had left. The 429 is `no-store`, so
  // the authoritative answer is never the cached one. `docs/terms.md` says so to consumers.
  for (const [name, value] of extraHeaders) {
    headers.set(name, value);
  }

  if (lastModified !== null) {
    headers.set("Last-Modified", new Date(lastModified).toUTCString());
  }

  if (
    matchesEtag(request.headers.get("if-none-match"), etag) ||
    isUnmodifiedSince(request.headers.get("if-modified-since"), lastModified)
  ) {
    return new NextResponse(null, { status: 304, headers });
  }

  headers.set("Content-Type", contentType);

  return new NextResponse(payload, { status: 200, headers });
}

/**
 * Line-delimited JSON, streamed.
 *
 * No `ETag`: the validator this module uses elsewhere is a hash of the body, and hashing the body
 * means holding it, which is the one thing a dump must not do. `Last-Modified` and
 * `If-Modified-Since` carry the same conversation for a caller that holds a copy, and cost one
 * cheap read rather than the whole catalogue.
 *
 * The records arrive as they are read from the database, so a failure halfway through cannot be
 * answered with a status code: the status is already sent. That is what the trailing record is for
 * so a reader that does not see it knows it has half a dump.
 */
export function ndjsonResponse(
  request: NextRequest,
  lastModified: string | null,
  records: AsyncIterable<unknown>,
  extraHeaders: readonly [string, string][] = [],
): NextResponse {
  const headers = publicHeaders();

  headers.set("Cache-Control", DUMP_CACHE_CONTROL);

  for (const [name, value] of extraHeaders) {
    headers.set(name, value);
  }

  if (lastModified !== null) {
    headers.set("Last-Modified", new Date(lastModified).toUTCString());
  }

  if (isUnmodifiedSince(request.headers.get("if-modified-since"), lastModified)) {
    return new NextResponse(null, { status: 304, headers });
  }

  headers.set("Content-Type", "application/x-ndjson; charset=utf-8");

  const encoder = new TextEncoder();
  const iterator = records[Symbol.asyncIterator]();

  // One record per `pull`, rather than a loop that drains the iterator: that is what makes this a
  // stream rather than a buffer with extra steps. The consumer asks for the next chunk when it has
  // somewhere to put it, and the database is only read that far ahead.
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();

      if (next.done === true) {
        controller.close();

        return;
      }

      controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
    },
    // A client that hangs up halfway through should stop the paging behind it, not go on reading
    // the catalogue into a socket nobody is holding.
    async cancel() {
      await iterator.return?.(undefined);
    },
  });

  return new NextResponse(body, { status: 200, headers });
}

/**
 * Every failure, in one shape: a code to branch on, a message to read, the parameter it is about
 * and the id of the request that produced it.
 *
 * `X-Request-Id` is set here and not on a successful response on purpose. An error is `no-store`,
 * so the id belongs to the caller who received it; a 200 is held by the CDN for everyone, and the
 * header would hand the next client the id of whoever happened to fill the cache.
 */
export function errorResponse(
  request: NextRequest,
  status: number,
  code: ErrorCode,
  message: string,
  parameter: string | null = ERROR_PARAMETERS[code],
): NextResponse {
  const headers = publicHeaders();
  const id = requestId(request);

  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", id);

  return NextResponse.json(
    { error: { code, message, parameter, request_id: id } },
    { status, headers },
  );
}

export function internalErrorResponse(
  request: NextRequest,
  context: string,
  cause: unknown,
): NextResponse {
  // The id goes in the log line and in the body, which is the whole point: a consumer can report a
  // failure by its id, and it can be found here without guessing at timestamps.
  console.error(context, `request_id=${requestId(request)}`, cause);

  return errorResponse(request, 500, "internal_error", "The catalogue could not be read.");
}

/**
 * Nothing has changed since the date the caller holds. HTTP dates carry whole seconds, so the
 * comparison is made at that resolution: a change inside the same second as the date a caller was
 * given would otherwise be answered with a 304. `If-None-Match` is checked first and is exact, so
 * this only decides for a client that sent the weaker header on its own.
 *
 * Only ever consulted when the response carries a `Last-Modified` of its own: with nothing to
 * compare against, the honest answer is the body.
 */
function isUnmodifiedSince(header: string | null, lastModified: string | null): boolean {
  if (header === null || lastModified === null) {
    return false;
  }

  const held = new Date(header).getTime();
  const current = new Date(lastModified).getTime();

  if (Number.isNaN(held) || Number.isNaN(current)) {
    return false;
  }

  return Math.floor(current / 1000) <= Math.floor(held / 1000);
}

/**
 * `If-None-Match` carries a list, and a cache is allowed to weaken a validator it stored, so the
 * `W/` prefix is ignored rather than failing the comparison.
 */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) {
    return false;
  }

  if (header.trim() === "*") {
    return true;
  }

  return header.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === etag);
}
