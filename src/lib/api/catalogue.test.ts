import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  lastModifiedOf,
  listDeletions,
  listEvents,
  listOperators,
  listSatellites,
  streamCatalogue,
} from "@/lib/api/catalogue";
import { NO_EVENT_FILTERS, type EventQuery, type SatelliteQuery } from "@/lib/api/query";

/**
 * These tests stand in for the database, because the two things worth pinning here are not about
 * rows: that an offset past the last row still answers a page, and that the column lists never grow
 * a column the public should not see.
 */

const mocks = vi.hoisted(() => ({ from: vi.fn<(table: string) => FakeBuilder>() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServiceRoleClient: () => ({ from: mocks.from }),
}));

interface Reply {
  count: number | null;
  data: unknown;
  error: { code: string; message: string } | null;
}

/** What was asked of one builder, so a test can compare two queries. */
interface Recorded {
  columns: string;
  /** The deadline the read was given, so a test can check every read carries one. */
  deadline: AbortSignal | null;
  filters: string[];
  head: boolean;
  range: [number, number] | null;
  table: string;
}

interface FakeBuilder {
  abortSignal(signal: AbortSignal): FakeBuilder;
  eq(column: string, value: number): FakeBuilder;
  gt(column: string, value: string): FakeBuilder;
  gte(column: string, value: string): FakeBuilder;
  is(column: string, value: null): FakeBuilder;
  lt(column: string, value: string): FakeBuilder;
  lte(column: string, value: string): FakeBuilder;
  not(column: string, operator: string, value: null): FakeBuilder;
  order(column: string, options: { ascending: boolean }): FakeBuilder;
  range(from: number, to: number): FakeBuilder;
  select(columns: string, options?: { count?: "exact"; head?: boolean }): FakeBuilder;
  then<T>(resolve: (reply: Reply) => T): Promise<T>;
}

const RANGE_NOT_SATISFIABLE = {
  code: "PGRST103",
  message: "Requested range not satisfiable",
};

/** Answers each `from()` with the next reply, and records what was asked. */
function answerWith(...replies: Reply[]): Recorded[] {
  const calls: Recorded[] = [];

  mocks.from.mockImplementation((table: string) => {
    const call: Recorded = {
      columns: "",
      deadline: null,
      filters: [],
      head: false,
      range: null,
      table,
    };
    const reply = replies[calls.length] ?? { count: 0, data: [], error: null };

    calls.push(call);

    const builder: FakeBuilder = {
      abortSignal(signal) {
        call.deadline = signal;

        return builder;
      },
      select(columns, options) {
        call.columns = columns;
        call.head = options?.head === true;

        return builder;
      },
      eq(column, value) {
        call.filters.push(`eq ${column} ${String(value)}`);

        return builder;
      },
      gt(column, value) {
        call.filters.push(`gt ${column} ${value}`);

        return builder;
      },
      gte(column, value) {
        call.filters.push(`gte ${column} ${value}`);

        return builder;
      },
      is(column) {
        call.filters.push(`is ${column} null`);

        return builder;
      },
      lt(column, value) {
        call.filters.push(`lt ${column} ${value}`);

        return builder;
      },
      lte(column, value) {
        call.filters.push(`lte ${column} ${value}`);

        return builder;
      },
      not(column, operator) {
        call.filters.push(`not ${column} ${operator} null`);

        return builder;
      },
      order() {
        return builder;
      },
      range(from, to) {
        call.range = [from, to];

        return builder;
      },
      then(resolve) {
        return Promise.resolve(reply).then(resolve);
      },
    };

    return builder;
  });

  return calls;
}

const EVENT_QUERY: EventQuery = { ...NO_EVENT_FILTERS, limit: 20, status: "upcoming" };

const SATELLITE_QUERY: SatelliteQuery = { limit: 20, offset: 0, since: null };

/** A row of `public_events`, which is flat: the view does the joins. */
const EVENT_ROW = {
  cancelled_at: null,
  created_at: "2026-09-13 18:00:00+00",
  title: "ARISS SSTV activity",
  end_time: "2026-09-14 09:24:00+00",
  frequency: 145.8,
  id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
  image_interval_seconds: 120,
  image_url: null,
  mode: "PD120",
  operator_logo_url: null,
  operator_name: "ARISS",
  operator_slug: "ariss",
  operator_url: "https://www.ariss.org/",
  satellite_alternate_name: "ZARYA",
  satellite_name: "ISS",
  satellite_norad_id: 25544,
  source_url: "https://www.ariss.org/",
  start_time: "2026-09-14 09:12:00+00",
  transmit_power_watts: 10,
  updated_at: "2026-09-13 18:00:00+00",
};

const SATELLITE_ROW = {
  alternate_name: "ZARYA",
  created_at: "2026-09-13 18:00:00+00",
  name: "ISS",
  norad_id: 25544,
  updated_at: "2026-09-13 18:00:00+00",
};

/** What `EVENT_ROW` must come out as: the published shape, asserted in one place. */
const EXPECTED_EVENT = {
  cancelled_at: null,
  created_at: "2026-09-13T18:00:00.000Z",
  title: "ARISS SSTV activity",
  end_time: "2026-09-14T09:24:00.000Z",
  frequency_mhz: 145.8,
  id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
  image_interval_seconds: 120,
  image_url: null,
  mode: "PD120",
  operator: { logo_url: null, name: "ARISS", slug: "ariss", url: "https://www.ariss.org/" },
  satellite: { alternate_name: "ZARYA", name: "ISS", norad_id: 25544 },
  source_url: "https://www.ariss.org/",
  start_time: "2026-09-14T09:12:00.000Z",
  transmit_power_watts: 10,
  updated_at: "2026-09-13T18:00:00.000Z",
};

beforeEach(() => {
  mocks.from.mockReset();
});

describe("listEvents", () => {
  it("serves the rows with the satellite nested and timestamps ending in Z", async () => {
    answerWith({ count: 1, data: [EVENT_ROW], error: null });

    const page = await listEvents(EVENT_QUERY);

    expect(page.count).toBe(1);
    expect(page.results[0]).toEqual(EXPECTED_EVENT);
  });

  it("falls back to the operator's logo when an event has no image of its own", async () => {
    answerWith({
      count: 1,
      data: [{ ...EVENT_ROW, operator_logo_url: "https://cdn.example/ariss.png" }],
      error: null,
    });

    const page = await listEvents(EVENT_QUERY);

    expect(page.results[0]?.image_url).toBe("https://cdn.example/ariss.png");
  });

  it("never selects a column that names the administrator who typed the row", () => {
    const calls = answerWith({ count: 0, data: [], error: null });

    void listEvents(EVENT_QUERY);

    expect(calls[0]?.columns).not.toContain("*");
    expect(calls[0]?.columns).not.toContain("created_by");
    expect(calls[0]?.columns).not.toContain("updated_by");
  });

  it("reads the view that holds only published columns, never the table", () => {
    // The secret key could read the table; `public_events` has no `created_by` to read.
    const calls = answerWith({ count: 0, data: [], error: null });

    void listEvents(EVENT_QUERY);

    expect(calls[0]?.table).toBe("public_events");
  });

  it("filters on the satellite number the view publishes", () => {
    const calls = answerWith({ count: 0, data: [], error: null });

    void listEvents({ ...EVENT_QUERY, noradId: 25544 });

    expect(calls[0]?.filters).toContain("eq satellite_norad_id 25544");
  });

  it("refuses a row missing something the tables underneath guarantee", async () => {
    // A view carries no `not null`, so this is the only place that can still say no. Publishing an
    // event with no operator would be publishing one nobody is answerable for.
    answerWith({
      count: 1,
      data: [{ ...EVENT_ROW, operator_slug: null }],
      error: null,
    });

    await expect(listEvents(EVENT_QUERY)).rejects.toThrow("operator_slug");
  });

  it("answers an offset past the last row with an empty page that still counts", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 7, data: null, error: null },
    );

    const page = await listEvents({ ...EVENT_QUERY, offset: 40 });

    expect(page).toEqual({ count: 7, results: [] });
    expect(calls[1]?.head).toBe(true);
  });

  it("counts the same rows the page would have held", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 0, data: null, error: null },
    );

    await listEvents({
      ...NO_EVENT_FILTERS,
      cancelled: true,
      limit: 5,
      mode: "PD120",
      noradId: 25544,
      offset: 100,
      operator: "ariss",
      since: "2026-01-01T00:00:00.000Z",
      startAfter: "2026-02-01T00:00:00.000Z",
      startBefore: "2026-03-01T00:00:00.000Z",
      status: "past",
    });

    expect(calls[0]?.filters).toEqual(calls[1]?.filters);
    expect(calls[0]?.filters).toHaveLength(8);
  });

  it("asks for exactly the page requested", async () => {
    const calls = answerWith({ count: 0, data: [], error: null });

    await listEvents({ ...EVENT_QUERY, limit: 5, offset: 10 });

    expect(calls[0]?.range).toEqual([10, 14]);
  });

  it("refuses to hide any other failure", async () => {
    answerWith({ count: null, data: null, error: { code: "PGRST301", message: "JWT expired" } });

    await expect(listEvents(EVENT_QUERY)).rejects.toThrow("JWT expired");
  });
});

/**
 * The published document promises a shape; this is the object that has to honour it. The rest of
 * openapi.json is checked in openapi.test.ts, but the event payload can only be compared against a
 * real one, and this is where a real one exists.
 */
describe("every read", () => {
  it("carries a deadline, so a database that has stopped answering cannot hold the API open", async () => {
    const list = answerWith({ count: 1, data: [EVENT_ROW], error: null });

    await listEvents(EVENT_QUERY);

    expect(list[0]?.deadline).toBeInstanceOf(AbortSignal);
    expect(list[0]?.deadline?.aborted).toBe(false);

    const satellites = answerWith({ count: 0, data: [], error: null });

    await listSatellites(SATELLITE_QUERY);

    expect(satellites[0]?.deadline).toBeInstanceOf(AbortSignal);
  });

  it("gives the fallback count its own deadline rather than a spent one", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 7, data: null, error: null },
    );

    await listEvents({ ...EVENT_QUERY, offset: 40 });

    expect(calls[1]?.deadline).toBeInstanceOf(AbortSignal);
    expect(calls[1]?.deadline).not.toBe(calls[0]?.deadline);
  });
});

describe("the documented event shape", () => {
  const schemas = (
    JSON.parse(readFileSync("public/openapi.json", "utf8")) as {
      components: {
        schemas: Record<string, { properties: Record<string, unknown>; required?: string[] }>;
      };
    }
  ).components.schemas;

  it("is what the API serves, field for field", async () => {
    answerWith({ count: 1, data: [EVENT_ROW], error: null });

    const page = await listEvents(EVENT_QUERY);
    const event = page.results[0] ?? {};

    expect(Object.keys(event).sort()).toEqual(Object.keys(schemas.Event?.properties ?? {}).sort());
    expect(Object.keys(event).sort()).toEqual([...(schemas.Event?.required ?? [])].sort());
  });

  it("nests the operator exactly as documented", async () => {
    answerWith({ count: 1, data: [EVENT_ROW], error: null });

    const page = await listEvents(EVENT_QUERY);

    expect(Object.keys(page.results[0]?.operator ?? {}).sort()).toEqual(
      Object.keys(schemas.Operator?.properties ?? {}).sort(),
    );
  });

  it("is what the operators endpoint serves, field for field", async () => {
    answerWith({
      count: 1,
      data: [
        {
          created_at: "2026-09-13 18:00:00+00",
          logo_url: null,
          name: "ARISS",
          slug: "ariss",
          updated_at: "2026-09-13 18:00:00+00",
          url: null,
        },
      ],
      error: null,
    });

    const page = await listOperators({ limit: 20, offset: 0, since: null });

    expect(Object.keys(page.results[0] ?? {}).sort()).toEqual(
      Object.keys(schemas.CatalogueOperator?.properties ?? {}).sort(),
    );
  });

  it("is what the deletions feed serves, field for field", async () => {
    answerWith({
      count: 1,
      data: [{ deleted_at: "2026-09-20 11:00:00+00", id: EVENT_ROW.id, resource: "event" }],
      error: null,
    });

    const page = await listDeletions({ limit: 20, offset: 0, since: null });

    expect(Object.keys(page.results[0] ?? {}).sort()).toEqual(
      Object.keys(schemas.Deletion?.properties ?? {}).sort(),
    );
  });

  it("nests the satellite exactly as documented", async () => {
    answerWith({ count: 1, data: [EVENT_ROW], error: null });

    const page = await listEvents(EVENT_QUERY);

    expect(Object.keys(page.results[0]?.satellite ?? {}).sort()).toEqual(
      Object.keys(schemas.EventSatellite?.properties ?? {}).sort(),
    );
  });
});

describe("listSatellites", () => {
  it("reads the view, and serves timestamps ending in Z like every other endpoint", async () => {
    // These rows used to be answered as PostgREST handed them over, `+00:00` and all, while the
    // documentation promised a `Z` throughout. Mapping them is what made the promise true.
    const calls = answerWith({ count: 1, data: [SATELLITE_ROW], error: null });

    const page = await listSatellites(SATELLITE_QUERY);

    expect(calls[0]?.table).toBe("public_satellites");
    expect(page.results[0]).toEqual({
      alternate_name: "ZARYA",
      created_at: "2026-09-13T18:00:00.000Z",
      name: "ISS",
      norad_id: 25544,
      updated_at: "2026-09-13T18:00:00.000Z",
    });
  });

  it("refuses a row missing something the table underneath guarantees", async () => {
    answerWith({ count: 1, data: [{ ...SATELLITE_ROW, name: null }], error: null });

    await expect(listSatellites(SATELLITE_QUERY)).rejects.toThrow("name");
  });

  it("answers an offset past the last row with an empty page that still counts", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 3, data: null, error: null },
    );

    const page = await listSatellites({ ...SATELLITE_QUERY, offset: 20 });

    expect(page).toEqual({ count: 3, results: [] });
    expect(calls[1]?.head).toBe(true);
  });

  it("carries since into the fallback count", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 1, data: null, error: null },
    );

    await listSatellites({ ...SATELLITE_QUERY, offset: 20, since: "2026-01-01T00:00:00.000Z" });

    expect(calls[1]?.filters).toEqual(["gte updated_at 2026-01-01T00:00:00.000Z"]);
  });
});

describe("listOperators", () => {
  const OPERATOR_ROW = {
    created_at: "2026-09-13 18:00:00+00",
    logo_url: null,
    name: "ARISS",
    slug: "ariss",
    updated_at: "2026-09-13 18:00:00+00",
    url: "https://www.ariss.org/",
  };

  it("reads the view, by name, with timestamps ending in Z", async () => {
    const calls = answerWith({ count: 1, data: [OPERATOR_ROW], error: null });

    const page = await listOperators({ limit: 20, offset: 0, since: null });

    expect(calls[0]?.table).toBe("public_operators");
    expect(page.results[0]).toEqual({
      created_at: "2026-09-13T18:00:00.000Z",
      logo_url: null,
      name: "ARISS",
      slug: "ariss",
      updated_at: "2026-09-13T18:00:00.000Z",
      url: "https://www.ariss.org/",
    });
  });

  it("never selects the id the slug exists to replace", () => {
    const calls = answerWith({ count: 0, data: [], error: null });

    void listOperators({ limit: 20, offset: 0, since: null });

    expect(calls[0]?.columns).not.toContain("*");
    expect(calls[0]?.columns.split(", ")).not.toContain("id");
  });

  it("answers an offset past the last row with an empty page that still counts", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 2, data: null, error: null },
    );

    const page = await listOperators({ limit: 20, offset: 40, since: null });

    expect(page).toEqual({ count: 2, results: [] });
    expect(calls[1]?.head).toBe(true);
  });

  it("refuses a row missing something the table underneath guarantees", async () => {
    answerWith({ count: 1, data: [{ ...OPERATOR_ROW, name: null }], error: null });

    await expect(listOperators({ limit: 20, offset: 0, since: null })).rejects.toThrow("name");
  });
});

describe("listDeletions", () => {
  const DELETION_ROW = {
    deleted_at: "2026-09-20 11:00:00+00",
    id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
    resource: "event",
  };

  it("reads the view and answers oldest first, so paging with since never goes backwards", async () => {
    const calls = answerWith({ count: 1, data: [DELETION_ROW], error: null });

    const page = await listDeletions({ limit: 20, offset: 0, since: null });

    expect(calls[0]?.table).toBe("public_deletions");
    expect(page.results[0]).toEqual({
      deleted_at: "2026-09-20T11:00:00.000Z",
      id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
      resource: "event",
    });
  });

  it("says what was deleted, so another resource getting tombstones breaks nobody", async () => {
    answerWith({ count: 1, data: [DELETION_ROW], error: null });

    const page = await listDeletions({ limit: 20, offset: 0, since: null });

    expect(page.results[0]?.resource).toBe("event");
  });

  it("filters on when the deletion happened, not on updated_at", async () => {
    const calls = answerWith({ count: 0, data: [], error: null });

    await listDeletions({ limit: 20, offset: 0, since: "2026-01-01T00:00:00.000Z" });

    expect(calls[0]?.filters).toEqual(["gte deleted_at 2026-01-01T00:00:00.000Z"]);
  });

  it("answers an offset past the last row with an empty page that still counts", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 4, data: null, error: null },
    );

    const page = await listDeletions({ limit: 20, offset: 40, since: null });

    expect(page).toEqual({ count: 4, results: [] });
    expect(calls[1]?.head).toBe(true);
  });

  it("carries since into the fallback count", async () => {
    const calls = answerWith(
      { count: null, data: null, error: RANGE_NOT_SATISFIABLE },
      { count: 1, data: null, error: null },
    );

    await listDeletions({ limit: 20, offset: 40, since: "2026-01-01T00:00:00.000Z" });

    expect(calls[1]?.filters).toEqual(["gte deleted_at 2026-01-01T00:00:00.000Z"]);
  });
});

describe("streamCatalogue", () => {
  const OPERATOR_ROW = {
    created_at: "2026-09-13 18:00:00+00",
    logo_url: null,
    name: "ARISS",
    slug: "ariss",
    updated_at: "2026-09-13 18:00:00+00",
    url: null,
  };

  async function collect(): Promise<{ type: string }[]> {
    const records: { type: string }[] = [];

    for await (const record of streamCatalogue()) {
      records.push(record);
    }

    return records;
  }

  it("reads the views, operators and satellites before the events that point at them", async () => {
    const calls = answerWith(
      { count: null, data: [OPERATOR_ROW], error: null },
      { count: null, data: [SATELLITE_ROW], error: null },
      { count: null, data: [EVENT_ROW], error: null },
    );

    expect((await collect()).map((record) => record.type)).toEqual([
      "operator",
      "satellite",
      "event",
    ]);
    expect(calls.map((call) => call.table)).toEqual([
      "public_operators",
      "public_satellites",
      "public_events",
    ]);
  });

  it("asks for no count, which is the whole reason the dump exists", () => {
    const calls = answerWith({ count: null, data: [], error: null });

    void collect();

    // `head` is only ever true for a counting query, and the columns carry no aggregate.
    expect(calls[0]?.head).toBe(false);
  });

  it("stops when a chunk comes back short rather than asking for one more page", async () => {
    const calls = answerWith(
      { count: null, data: [OPERATOR_ROW], error: null },
      { count: null, data: [], error: null },
      { count: null, data: [], error: null },
    );

    await collect();

    // One request per view, because the first chunk of each was already short.
    expect(calls).toHaveLength(3);
    expect(calls[0]?.range).toEqual([0, 999]);
  });

  it("maps every record the way its endpoint does, timestamps included", async () => {
    answerWith(
      { count: null, data: [], error: null },
      { count: null, data: [], error: null },
      { count: null, data: [EVENT_ROW], error: null },
    );

    const [event] = await collect();

    expect(event).toEqual({ type: "event", ...EXPECTED_EVENT });
  });

  it("does not hide a failure halfway through the catalogue", async () => {
    answerWith(
      { count: null, data: [], error: null },
      { count: null, data: null, error: { code: "PGRST301", message: "JWT expired" } },
    );

    await expect(collect()).rejects.toThrow("JWT expired");
  });
});

describe("lastModifiedOf", () => {
  it("is the newest change in the page", () => {
    expect(
      lastModifiedOf([
        "2026-09-13T18:00:00.000Z",
        "2026-09-14T06:30:00.000Z",
        "2026-09-01T00:00:00.000Z",
      ]),
    ).toBe("2026-09-14T06:30:00.000Z");
  });

  it("is null for an empty page, rather than a date nothing in the response supports", () => {
    expect(lastModifiedOf([])).toBeNull();
  });
});
