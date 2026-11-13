import type { DeletionQuery, EventQuery, PageQuery, SatelliteQuery } from "@/lib/api/query";
import type { Database } from "@/lib/database.types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";

/**
 * The public reads live here, and only here. They go through the secret key, which bypasses Row
 * Level Security, so the tables themselves are not what stops a stray column being published:
 * these reads go to `public_events` and `public_satellites`, two views that hold exactly what the
 * API returns. `created_by` and `updated_by` are not columns of either, so no selection from here
 * can publish them, `select *` included. The lists below stay explicit anyway, because a reader of
 * this file should be able to see the published shape without opening a migration.
 *
 * The views are flat and the nesting happens in `toPublicEvent`, which is where it happened before.
 */
const EVENT_VIEW = "public_events";
const SATELLITE_VIEW = "public_satellites";
const DELETION_VIEW = "public_deletions";
const OPERATOR_VIEW = "public_operators";

const EVENT_COLUMNS =
  "id, start_time, end_time, frequency, mode, transmit_power_watts, title, image_url, image_interval_seconds, source_url, cancelled_at, created_at, updated_at, satellite_norad_id, satellite_name, satellite_alternate_name, operator_slug, operator_name, operator_url, operator_logo_url";

const SATELLITE_COLUMNS = "norad_id, name, alternate_name, created_at, updated_at";

const DELETION_COLUMNS = "resource, id, deleted_at";

const OPERATOR_COLUMNS = "slug, name, url, logo_url, created_at, updated_at";

/**
 * How many rows the dump asks for at a time. PostgREST caps a response at a thousand rows whatever
 * is asked for, so the whole catalogue cannot come back in one answer however small it is today.
 */
const DUMP_CHUNK = 1000;

/**
 * PostgREST answers this for any offset past the last row, including one passed as a query parameter
 * rather than a Range header, so the empty page has to be built by hand with a count of its own.
 */
const RANGE_NOT_SATISFIABLE = "PGRST103";

/**
 * How long a read may take before the request is given up on. Without it, a database that has
 * stopped answering holds every function open until the platform kills it: the API stops answering
 * at all, rather than answering 500 and letting the shared cache serve what it still has.
 *
 * Long enough for a cold connection and the exact `COUNT` a list page runs, short enough to be
 * well inside the platform's own limit.
 */
const READ_TIMEOUT_MS = 5000;

/** What a health check waits for. See `pingCatalogue`. */
const PING_TIMEOUT_MS = 2000;

/** One per request: an `AbortSignal` is spent once it fires, so it cannot be shared or reused. */
function readDeadline(): AbortSignal {
  return AbortSignal.timeout(READ_TIMEOUT_MS);
}

export interface PublicSatellite {
  alternate_name: string | null;
  created_at: string;
  name: string;
  norad_id: number;
  updated_at: string;
}

export interface PublicDeletion {
  deleted_at: string;
  id: string;
  /** What was deleted. Only `event` today; see the view's comment in the migration. */
  resource: string;
}

/**
 * One line of the dump. Flat, with `type` in front, so a consumer can dispatch on it while reading
 * the stream rather than holding the file.
 */
export type DumpRecord =
  | ({ type: "event" } & PublicEvent)
  | ({ type: "operator" } & PublicOperator)
  | ({ type: "satellite" } & PublicSatellite);

export interface PublicOperator {
  created_at: string;
  logo_url: string | null;
  name: string;
  slug: string;
  updated_at: string;
  url: string | null;
}

export interface PublicEvent {
  cancelled_at: string | null;
  created_at: string;
  end_time: string;
  frequency_mhz: number;
  id: string;
  image_interval_seconds: number | null;
  /** Artwork for the event, or the operator's logo when the event has none of its own. */
  image_url: string | null;
  mode: string;
  /** Required of every event by the database, so this is never null. */
  operator: {
    logo_url: string | null;
    name: string;
    slug: string;
    url: string | null;
  };
  satellite: {
    alternate_name: string | null;
    name: string;
    norad_id: number;
  };
  source_url: string | null;
  start_time: string;
  title: string | null;
  transmit_power_watts: number | null;
  updated_at: string;
}

export interface Page<T> {
  count: number;
  results: T[];
}

/** The filter methods both the page query and the counting query need. */
interface Filterable {
  eq(column: string, value: number | string): this;
  gt(column: string, value: string): this;
  gte(column: string, value: string): this;
  is(column: string, value: null): this;
  lt(column: string, value: string): this;
  lte(column: string, value: string): this;
  not(column: string, operator: string, value: null): this;
}

/** Applied to both queries from one place, so a page and its count cannot describe different rows. */
function filterEvents<Builder extends Filterable>(
  builder: Builder,
  query: EventQuery,
  now: string,
): Builder {
  let filtered = builder;

  // `status` is derived from the clock rather than stored, so an event becomes live and then past
  // without anything having to write to it.
  if (query.status === "upcoming") {
    filtered = filtered.gt("start_time", now);
  } else if (query.status === "live") {
    filtered = filtered.lte("start_time", now).gte("end_time", now);
  } else if (query.status === "past") {
    filtered = filtered.lt("end_time", now);
  }

  if (query.noradId !== null) {
    filtered = filtered.eq("satellite_norad_id", query.noradId);
  }

  if (query.operator !== null) {
    filtered = filtered.eq("operator_slug", query.operator);
  }

  if (query.mode !== null) {
    filtered = filtered.eq("mode", query.mode);
  }

  // Absolute bounds on the transmission itself, where `status` is relative to the clock. Both
  // apply, so `status=upcoming&start_before=...` is "soon" without the client doing arithmetic.
  if (query.startAfter !== null) {
    filtered = filtered.gte("start_time", query.startAfter);
  }

  if (query.startBefore !== null) {
    filtered = filtered.lte("start_time", query.startBefore);
  }

  if (query.since !== null) {
    filtered = filtered.gte("updated_at", query.since);
  }

  if (query.cancelled === true) {
    filtered = filtered.not("cancelled_at", "is", null);
  } else if (query.cancelled === false) {
    filtered = filtered.is("cancelled_at", null);
  }

  return filtered;
}

export async function listEvents(query: EventQuery): Promise<Page<PublicEvent>> {
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const ascending = query.status !== "past";

  const { data, count, error } = await filterEvents(
    supabase.from(EVENT_VIEW).select(EVENT_COLUMNS, { count: "exact" }).abortSignal(readDeadline()),
    query,
    now,
  )
    .order("start_time", { ascending })
    // Secondary key, so paging stays stable when several events share a start_time.
    .order("id", { ascending })
    .range(query.offset, query.offset + query.limit - 1);

  if (error !== null) {
    if (error.code === RANGE_NOT_SATISFIABLE) {
      return { count: await countEvents(query, now), results: [] };
    }

    throw new Error(error.message);
  }

  return { count: count ?? 0, results: data.map(toPublicEvent) };
}

/** Only for a page that starts past the end, where the page query could not report a count. */
async function countEvents(query: EventQuery, now: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();

  const { count, error } = await filterEvents(
    supabase
      .from(EVENT_VIEW)
      .select("id", { count: "exact", head: true })
      .abortSignal(readDeadline()),
    query,
    now,
  );

  if (error !== null) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function findEvent(id: string): Promise<PublicEvent | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from(EVENT_VIEW)
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .abortSignal(readDeadline())
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data === null ? null : toPublicEvent(data);
}

export async function listSatellites(query: SatelliteQuery): Promise<Page<PublicSatellite>> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(SATELLITE_VIEW)
    .select(SATELLITE_COLUMNS, { count: "exact" })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("updated_at", query.since);
  }

  const { data, count, error } = await builder
    .order("name", { ascending: true })
    .order("norad_id", { ascending: true })
    .range(query.offset, query.offset + query.limit - 1);

  if (error !== null) {
    if (error.code === RANGE_NOT_SATISFIABLE) {
      return { count: await countSatellites(query), results: [] };
    }

    throw new Error(error.message);
  }

  return { count: count ?? 0, results: data.map(toPublicSatellite) };
}

async function countSatellites(query: SatelliteQuery): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(SATELLITE_VIEW)
    .select("norad_id", { count: "exact", head: true })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("updated_at", query.since);
  }

  const { count, error } = await builder;

  if (error !== null) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function findSatellite(noradId: number): Promise<PublicSatellite | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from(SATELLITE_VIEW)
    .select(SATELLITE_COLUMNS)
    .eq("norad_id", noradId)
    .abortSignal(readDeadline())
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data === null ? null : toPublicSatellite(data);
}

/** The organisations the events name, so a client can list them or resolve a slug it has seen. */
export async function listOperators(query: PageQuery): Promise<Page<PublicOperator>> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(OPERATOR_VIEW)
    .select(OPERATOR_COLUMNS, { count: "exact" })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("updated_at", query.since);
  }

  const { data, count, error } = await builder
    .order("name", { ascending: true })
    .order("slug", { ascending: true })
    .range(query.offset, query.offset + query.limit - 1);

  if (error !== null) {
    if (error.code === RANGE_NOT_SATISFIABLE) {
      return { count: await countOperators(query), results: [] };
    }

    throw new Error(error.message);
  }

  return { count: count ?? 0, results: data.map(toPublicOperator) };
}

async function countOperators(query: PageQuery): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(OPERATOR_VIEW)
    .select("slug", { count: "exact", head: true })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("updated_at", query.since);
  }

  const { count, error } = await builder;

  if (error !== null) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function findOperator(slug: string): Promise<PublicOperator | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from(OPERATOR_VIEW)
    .select(OPERATOR_COLUMNS)
    .eq("slug", slug)
    .abortSignal(readDeadline())
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data === null ? null : toPublicOperator(data);
}

/**
 * The whole catalogue, in order, a chunk at a time.
 *
 * Operators and satellites first, so a consumer that wants to resolve an event's `operator.slug` or
 * `satellite.norad_id` against the full record has already seen it by the time the events arrive.
 *
 * No `count` on any of these: the exact count is the most expensive query in the API, and the whole
 * point of a dump is to stop a client from paying it five hundred times. The page ends when a chunk
 * comes back short, which is the only signal needed.
 */
export async function* streamCatalogue(): AsyncGenerator<DumpRecord> {
  const supabase = createSupabaseServiceRoleClient();

  for await (const operator of chunked(async (from, to) => {
    const { data, error } = await supabase
      .from(OPERATOR_VIEW)
      .select(OPERATOR_COLUMNS)
      .abortSignal(readDeadline())
      .order("slug", { ascending: true })
      .range(from, to);

    if (error !== null) {
      throw new Error(error.message);
    }

    return data.map(toPublicOperator);
  })) {
    yield { type: "operator", ...operator };
  }

  for await (const satellite of chunked(async (from, to) => {
    const { data, error } = await supabase
      .from(SATELLITE_VIEW)
      .select(SATELLITE_COLUMNS)
      .abortSignal(readDeadline())
      .order("norad_id", { ascending: true })
      .range(from, to);

    if (error !== null) {
      throw new Error(error.message);
    }

    return data.map(toPublicSatellite);
  })) {
    yield { type: "satellite", ...satellite };
  }

  for await (const event of chunked(async (from, to) => {
    const { data, error } = await supabase
      .from(EVENT_VIEW)
      .select(EVENT_COLUMNS)
      .abortSignal(readDeadline())
      // The order the API pages in, and the one `(start_time, id)` serves, so the dump reads the
      // catalogue the cheap way round.
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error !== null) {
      throw new Error(error.message);
    }

    return data.map(toPublicEvent);
  })) {
    yield { type: "event", ...event };
  }
}

/**
 * Walks a view a chunk at a time until one comes back short.
 *
 * `offset` rather than a keyset: it is the simpler thing, and for a hand-curated catalogue read once
 * an hour by a cache the cost of a deepening offset is not worth the compound comparison a keyset
 * needs through PostgREST. `cursor paging` on the roadmap would change both this and the list
 * endpoints together.
 */
async function* chunked<T>(
  fetchChunk: (from: number, to: number) => Promise<T[]>,
): AsyncGenerator<T> {
  for (let offset = 0; ; offset += DUMP_CHUNK) {
    const chunk = await fetchChunk(offset, offset + DUMP_CHUNK - 1);

    for (const row of chunk) {
      yield row;
    }

    if (chunk.length < DUMP_CHUNK) {
      return;
    }
  }
}

/**
 * The newest change anywhere in the catalogue, for the dump's `Last-Modified`. A mirror that holds
 * a copy can then ask with `If-Modified-Since` and be told, in one request, that nothing has moved.
 */
export async function latestCatalogueChange(): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();

  // The literal names, not `string`: the client types each relation's columns from the name, so a
  // widened parameter makes `updated_at` a column it cannot prove exists.
  const newest = async (
    view: typeof EVENT_VIEW | typeof OPERATOR_VIEW | typeof SATELLITE_VIEW,
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from(view)
      .select("updated_at")
      .abortSignal(readDeadline())
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error !== null) {
      throw new Error(error.message);
    }

    return data?.updated_at ?? null;
  };

  const stamps = await Promise.all([
    newest(EVENT_VIEW),
    newest(SATELLITE_VIEW),
    newest(OPERATOR_VIEW),
  ]);

  return lastModifiedOf(stamps.filter((stamp): stamp is string => stamp !== null));
}

/**
 * What a client has to drop from its own copy. The only change `?since=` cannot report by itself,
 * since a row that is gone has no `updated_at` left to carry.
 */
export async function listDeletions(query: DeletionQuery): Promise<Page<PublicDeletion>> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(DELETION_VIEW)
    .select(DELETION_COLUMNS, { count: "exact" })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("deleted_at", query.since);
  }

  const { data, count, error } = await builder
    // Oldest first, so a client that pages through with `since` never has to go backwards, and
    // `id` to break a tie between two deletions in the same instant.
    .order("deleted_at", { ascending: true })
    .order("id", { ascending: true })
    .range(query.offset, query.offset + query.limit - 1);

  if (error !== null) {
    if (error.code === RANGE_NOT_SATISFIABLE) {
      return { count: await countDeletions(query), results: [] };
    }

    throw new Error(error.message);
  }

  return { count: count ?? 0, results: data.map(toPublicDeletion) };
}

async function countDeletions(query: DeletionQuery): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();

  let builder = supabase
    .from(DELETION_VIEW)
    .select("id", { count: "exact", head: true })
    .abortSignal(readDeadline());

  if (query.since !== null) {
    builder = builder.gte("deleted_at", query.since);
  }

  const { count, error } = await builder;

  if (error !== null) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

/**
 * Asks the catalogue whether it is there, and how long it took to say so.
 *
 * One `HEAD` for one column of one row: the cheapest question that still goes all the way to
 * Postgres and back through the same client the endpoints use, so an answer here means the reads
 * they do would work too. Throws when it would not.
 *
 * Its own deadline, shorter than a read's: a health check that takes five seconds to fail has
 * already failed, and whatever is watching has its own patience to spend.
 */
export async function pingCatalogue(): Promise<number> {
  const started = Date.now();

  const { error } = await createSupabaseServiceRoleClient()
    .from(SATELLITE_VIEW)
    .select("norad_id", { head: true })
    .abortSignal(AbortSignal.timeout(PING_TIMEOUT_MS))
    .limit(1);

  if (error !== null) {
    throw new Error(error.message);
  }

  return Date.now() - started;
}

/**
 * The newest of a page's timestamps, for `Last-Modified`. Null for an empty page: a date there would
 * be a claim about data that is not in the response.
 *
 * Takes the stamps rather than the rows, because what counts as the last change depends on the
 * endpoint: `updated_at` for a catalogue page, `deleted_at` for the deletions feed.
 */
export function lastModifiedOf(stamps: readonly string[]): string | null {
  return stamps.reduce<string | null>(
    (latest, stamp) => (latest === null || stamp > latest ? stamp : latest),
    null,
  );
}

/**
 * A view carries no `not null`, so every column of one is optional as far as the generated types
 * are concerned, even where the table underneath guarantees it and the join cannot miss. Rather
 * than assert that away, the two mappers below check what the database promises and refuse a row
 * that breaks the promise, which is what the old code did for an event with no operator.
 */
type EventRow = Database["public"]["Views"]["public_events"]["Row"];
type SatelliteRow = Database["public"]["Views"]["public_satellites"]["Row"];
type DeletionRow = Database["public"]["Views"]["public_deletions"]["Row"];
type OperatorRow = Database["public"]["Views"]["public_operators"]["Row"];

/**
 * Timestamps go out with a `Z` rather than the `+00:00` PostgREST returns. Both are valid RFC 3339,
 * but one of them is what every client's naive parser expects.
 */
function toPublicEvent(row: EventRow): PublicEvent {
  const guaranteed = <T>(value: T | null, column: string): T => {
    if (value === null) {
      throw new Error(
        `Event ${row.id ?? "(with no id)"} has no ${column}, which the database forbids.`,
      );
    }

    return value;
  };

  return {
    id: guaranteed(row.id, "id"),
    satellite: {
      norad_id: guaranteed(row.satellite_norad_id, "satellite_norad_id"),
      name: guaranteed(row.satellite_name, "satellite_name"),
      alternate_name: row.satellite_alternate_name,
    },
    operator: {
      slug: guaranteed(row.operator_slug, "operator_slug"),
      name: guaranteed(row.operator_name, "operator_name"),
      url: row.operator_url,
      logo_url: row.operator_logo_url,
    },
    start_time: toIsoZ(guaranteed(row.start_time, "start_time")),
    end_time: toIsoZ(guaranteed(row.end_time, "end_time")),
    frequency_mhz: guaranteed(row.frequency, "frequency"),
    mode: guaranteed(row.mode, "mode"),
    transmit_power_watts: row.transmit_power_watts,
    title: row.title,
    image_url: row.image_url ?? row.operator_logo_url,
    image_interval_seconds: row.image_interval_seconds,
    source_url: row.source_url,
    cancelled_at: row.cancelled_at === null ? null : toIsoZ(row.cancelled_at),
    created_at: toIsoZ(guaranteed(row.created_at, "created_at")),
    updated_at: toIsoZ(guaranteed(row.updated_at, "updated_at")),
  };
}

function toPublicSatellite(row: SatelliteRow): PublicSatellite {
  const guaranteed = <T>(value: T | null, column: string): T => {
    if (value === null) {
      throw new Error(
        `Satellite ${String(row.norad_id ?? "(with no NORAD number)")} has no ${column}, which the database forbids.`,
      );
    }

    return value;
  };

  return {
    norad_id: guaranteed(row.norad_id, "norad_id"),
    name: guaranteed(row.name, "name"),
    alternate_name: row.alternate_name,
    created_at: toIsoZ(guaranteed(row.created_at, "created_at")),
    updated_at: toIsoZ(guaranteed(row.updated_at, "updated_at")),
  };
}

function toPublicOperator(row: OperatorRow): PublicOperator {
  const guaranteed = <T>(value: T | null, column: string): T => {
    if (value === null) {
      throw new Error(
        `Operator ${row.slug ?? "(with no slug)"} has no ${column}, which the database forbids.`,
      );
    }

    return value;
  };

  return {
    slug: guaranteed(row.slug, "slug"),
    name: guaranteed(row.name, "name"),
    url: row.url,
    logo_url: row.logo_url,
    created_at: toIsoZ(guaranteed(row.created_at, "created_at")),
    updated_at: toIsoZ(guaranteed(row.updated_at, "updated_at")),
  };
}

function toPublicDeletion(row: DeletionRow): PublicDeletion {
  const guaranteed = <T>(value: T | null, column: string): T => {
    if (value === null) {
      throw new Error(`A deletion has no ${column}, which the database forbids.`);
    }

    return value;
  };

  return {
    resource: guaranteed(row.resource, "resource"),
    id: guaranteed(row.id, "id"),
    deleted_at: toIsoZ(guaranteed(row.deleted_at, "deleted_at")),
  };
}

function toIsoZ(value: string): string {
  return new Date(value).toISOString();
}
