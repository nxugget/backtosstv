import type { ErrorCode } from "@/lib/api/http";
import { MAX_NORAD_ID } from "@/lib/bounds";
import { Constants } from "@/lib/database.types";
import { isOperatorSlug, isUuid } from "@/lib/parse";

export const STATUS_FILTERS = ["upcoming", "live", "past", "all"] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];

const DEFAULT_STATUS: StatusFilter = "upcoming";
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface QueryFailure {
  code: ErrorCode;
  message: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; failure: QueryFailure };

export interface Pagination {
  limit: number;
  offset: number;
}

/** The SSTV modes the database allows, straight from the generated enum so the two cannot drift. */
export const MODES = Constants.public.Enums.sstv_mode;

export type Mode = (typeof MODES)[number];

export interface EventQuery extends Pagination {
  /** null means both cancelled and standing events. */
  cancelled: boolean | null;
  mode: Mode | null;
  noradId: number | null;
  /** Slug of the organisation running the transmission. */
  operator: string | null;
  /** ISO instant: only events changed at or after it. */
  since: string | null;
  /** ISO instants bounding `start_time`, which is absolute where `status` is relative to now. */
  startAfter: string | null;
  startBefore: string | null;
  status: StatusFilter;
}

/** Everything a list endpoint takes when it has no filters of its own. */
export interface PageQuery extends Pagination {
  since: string | null;
}

export type SatelliteQuery = PageQuery;
export type DeletionQuery = PageQuery;

/**
 * Every filter off, for a caller that is not a request: the site's own pages, and tests. The route
 * handlers never use it, because a query string has to be read parameter by parameter, but a
 * server component asking for "the next six" should not have to name every filter it does not want,
 * and should not need touching the next time one is added.
 */
export const NO_EVENT_FILTERS: EventQuery = {
  cancelled: null,
  limit: DEFAULT_LIMIT,
  mode: null,
  noradId: null,
  offset: 0,
  operator: null,
  since: null,
  startAfter: null,
  startBefore: null,
  status: DEFAULT_STATUS,
};

export function parseEventQuery(searchParams: URLSearchParams): Parsed<EventQuery> {
  const status = STATUS_FILTERS.find((candidate) => candidate === searchParams.get("status"));

  if (searchParams.get("status") !== null && status === undefined) {
    return failure(
      "invalid_status",
      `Invalid status. Expected one of: ${STATUS_FILTERS.join(", ")}.`,
    );
  }

  const pagination = parsePagination(searchParams);

  if (!pagination.ok) {
    return pagination;
  }

  const since = parseSince(searchParams);

  if (!since.ok) {
    return since;
  }

  const noradId = parseOptionalNoradId(searchParams.get("norad_id"));

  if (!noradId.ok) {
    return noradId;
  }

  const cancelled = parseOptionalBoolean(searchParams.get("cancelled"));

  if (!cancelled.ok) {
    return cancelled;
  }

  const operator = parseOptionalSlug(searchParams.get("operator"));

  if (!operator.ok) {
    return operator;
  }

  const mode = parseOptionalMode(searchParams.get("mode"));

  if (!mode.ok) {
    return mode;
  }

  const startAfter = parseOptionalInstant(searchParams, "start_after", "invalid_start_after");

  if (!startAfter.ok) {
    return startAfter;
  }

  const startBefore = parseOptionalInstant(searchParams, "start_before", "invalid_start_before");

  if (!startBefore.ok) {
    return startBefore;
  }

  return {
    ok: true,
    value: {
      cancelled: cancelled.value,
      limit: pagination.value.limit,
      mode: mode.value,
      noradId: noradId.value,
      offset: pagination.value.offset,
      operator: operator.value,
      since: since.value,
      startAfter: startAfter.value,
      startBefore: startBefore.value,
      status: status ?? DEFAULT_STATUS,
    },
  };
}

export function parsePageQuery(searchParams: URLSearchParams): Parsed<PageQuery> {
  const pagination = parsePagination(searchParams);

  if (!pagination.ok) {
    return pagination;
  }

  const since = parseSince(searchParams);

  if (!since.ok) {
    return since;
  }

  return {
    ok: true,
    value: { limit: pagination.value.limit, offset: pagination.value.offset, since: since.value },
  };
}

function parsePagination(searchParams: URLSearchParams): Parsed<Pagination> {
  const limit = parseBoundedInteger(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

  if (limit === null) {
    return failure(
      "invalid_limit",
      `Invalid limit. Expected an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  const offset = parseBoundedInteger(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  if (offset === null) {
    return failure(
      "invalid_offset",
      "Invalid offset. Expected an integer greater than or equal to 0.",
    );
  }

  return { ok: true, value: { limit, offset } };
}

/** Events are identified by the UUID the API returns, checked here so a bad one is a 400, not a 500. */
export function isEventId(value: string): boolean {
  return isUuid(value);
}

export function parseNoradId(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed > 0 && parsed <= MAX_NORAD_ID ? parsed : null;
}

/**
 * `YYYY-MM-DD`, optionally a time, optionally a zone. Everything `new Date()` is willing to guess
 * at is refused: `since=yesterday` or `since=2026` used to parse, and a value that parses into the
 * wrong instant is worse than a 400, because the client gets a page that looks right and is short.
 */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

function parseSince(searchParams: URLSearchParams): Parsed<string | null> {
  return parseOptionalInstant(searchParams, "since", "invalid_since");
}

/** Every instant the API takes is read the same way, and refused the same way. */
function parseOptionalInstant(
  searchParams: URLSearchParams,
  parameter: string,
  code: ErrorCode,
): Parsed<string | null> {
  const raw = searchParams.get(parameter)?.trim();

  if (raw === undefined) {
    return { ok: true, value: null };
  }

  const failed = failure(
    code,
    `Invalid ${parameter}. Expected an ISO 8601 instant, such as 2026-09-14T09:12:00Z. A time without a zone is read as UTC.`,
  );

  if (!ISO_INSTANT.test(raw)) {
    return failed;
  }

  // A date alone is already UTC midnight to `Date`, but `2026-09-14T09:12:00` is not: that one is
  // read in the server's zone, which makes the same request mean different things depending on
  // where it ran. The API is UTC throughout, so it is spelled out here.
  const zoned = /\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const parsed = new Date(zoned ? `${raw.replace(" ", "T")}Z` : raw);

  if (Number.isNaN(parsed.getTime()) || !isRealDate(raw.slice(0, 10))) {
    return failed;
  }

  return { ok: true, value: parsed.toISOString() };
}

/**
 * `new Date("2026-02-30")` is the 2nd of March, and `2026-13-01` is a month in 2027: a day that
 * does not exist rolls over silently rather than failing. The calendar part is therefore checked
 * on its own, before any zone offset can legitimately move the date.
 */
function isRealDate(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() + 1 === month && utc.getUTCDate() === day
  );
}

function parseOptionalNoradId(value: string | null): Parsed<number | null> {
  if (value === null) {
    return { ok: true, value: null };
  }

  const parsed = parseNoradId(value);

  if (parsed === null) {
    return failure("invalid_norad_id", "Invalid norad_id. Expected a positive integer.");
  }

  return { ok: true, value: parsed };
}

function parseOptionalSlug(value: string | null): Parsed<string | null> {
  if (value === null) {
    return { ok: true, value: null };
  }

  // Checked rather than passed through: an unknown slug is an empty page, but a slug that is not
  // one at all is a mistake worth reporting.
  if (!isOperatorSlug(value)) {
    return failure(
      "invalid_operator",
      "Invalid operator. Expected the slug of an operator, such as ariss.",
    );
  }

  return { ok: true, value };
}

function parseOptionalMode(value: string | null): Parsed<Mode | null> {
  if (value === null) {
    return { ok: true, value: null };
  }

  const mode = MODES.find((candidate) => candidate === value);

  if (mode === undefined) {
    return failure("invalid_mode", `Invalid mode. Expected one of: ${MODES.join(", ")}.`);
  }

  return { ok: true, value: mode };
}

function parseOptionalBoolean(value: string | null): Parsed<boolean | null> {
  if (value === null) {
    return { ok: true, value: null };
  }

  if (value === "true") {
    return { ok: true, value: true };
  }

  if (value === "false") {
    return { ok: true, value: false };
  }

  return failure("invalid_cancelled", "Invalid cancelled. Expected true or false.");
}

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

function failure(code: ErrorCode, message: string): { ok: false; failure: QueryFailure } {
  return { ok: false, failure: { code, message } };
}
