import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, HEAD } from "./route";

/**
 * The first test through a route handler, and the reason is the dump: the manifest, the counts and
 * the closing record are assembled here rather than in `@/lib/api`, so nothing else can check that
 * a reader is told how much it was given.
 */
const mocks = vi.hoisted(() => ({
  latestCatalogueChange: vi.fn<() => Promise<string | null>>(),
  streamCatalogue: vi.fn(),
}));

vi.mock("@/lib/api/catalogue", () => ({
  latestCatalogueChange: mocks.latestCatalogueChange,
  streamCatalogue: mocks.streamCatalogue,
}));

// The limiter counts in Postgres when no Redis is configured, which needs an environment this test
// has no business carrying. It fails open, so an unlimited caller is the honest stand-in.
vi.mock("@/lib/api/rate-limit", () => ({
  rateLimit: () => Promise.resolve({ exceeded: null, headers: [] }),
}));

const EVENT = { id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f", mode: "PD120", type: "event" };
const OPERATOR = { name: "ARISS", slug: "ariss", type: "operator" };
const SATELLITE = { name: "ISS", norad_id: 25544, type: "satellite" };

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://backtosstv.test/api/v1/dump.ndjson", { headers });
}

function answerWith(...records: unknown[]) {
  mocks.streamCatalogue.mockImplementation(async function* () {
    for (const record of records) {
      yield await Promise.resolve(record);
    }
  });
}

async function recordsOf(response: Response): Promise<{ type: string; counts?: unknown }[]> {
  const body = await response.text();

  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { type: string; counts?: unknown });
}

beforeEach(() => {
  // Call counts, not implementations: a test asserting the catalogue was never read has to start
  // from zero, and `restoreAllMocks` leaves the tally of a hoisted `vi.fn()` alone.
  vi.clearAllMocks();
  mocks.latestCatalogueChange.mockResolvedValue("2026-09-14T09:12:00.000Z");
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SITE_URL;
});

describe("GET /api/v1/dump.ndjson", () => {
  it("opens with a manifest and closes with the counts it served", async () => {
    answerWith(OPERATOR, SATELLITE, EVENT, EVENT);

    const records = await recordsOf(await GET(request()));

    expect(records[0]?.type).toBe("manifest");
    expect(records.map((record) => record.type)).toEqual([
      "manifest",
      "operator",
      "satellite",
      "event",
      "event",
      "end",
    ]);
    expect(records.at(-1)?.counts).toEqual({ event: 2, operator: 1, satellite: 1 });
  });

  it("tells a mirror where to go next, from the moment the dump was taken", async () => {
    process.env.SITE_URL = "https://backtosstv.org";
    answerWith();

    const [manifest] = (await recordsOf(await GET(request()))) as unknown as [
      { generated_at: string; synchronise: { changed: string; deleted: string } },
    ];
    const since = encodeURIComponent(manifest.generated_at);

    expect(manifest.synchronise.changed).toBe(
      `https://backtosstv.org/api/v1/events?status=all&since=${since}`,
    );
    expect(manifest.synchronise.deleted).toBe(
      `https://backtosstv.org/api/v1/deletions?since=${since}`,
    );
  });

  it("is served as line-delimited JSON a cache may keep", async () => {
    answerWith(EVENT);

    const response = await GET(request());

    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("last-modified")).toBe("Mon, 14 Sep 2026 09:12:00 GMT");
    expect(response.headers.get("cache-control")).toContain("s-maxage=");
  });

  it("answers 304 without reading the catalogue when nothing has moved", async () => {
    answerWith(EVENT);

    const response = await GET(request({ "if-modified-since": "Mon, 14 Sep 2026 09:12:00 GMT" }));

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(mocks.streamCatalogue).not.toHaveBeenCalled();
  });

  it("answers an error with a status code while it still can", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.latestCatalogueChange.mockRejectedValue(new Error("the database is not answering"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "The catalogue could not be read.",
        parameter: null,
        // The dump takes no parameters, so an id is all a consumer can quote in a report, and
        // the log line behind this 500 carries the same one.
        request_id: response.headers.get("x-request-id"),
      },
    });
  });
});

describe("HEAD /api/v1/dump.ndjson", () => {
  it("carries the headers without reading the catalogue", async () => {
    answerWith(EVENT);

    const response = await HEAD(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("last-modified")).toBe("Mon, 14 Sep 2026 09:12:00 GMT");
    expect(await response.text()).toBe("");
    expect(mocks.streamCatalogue).not.toHaveBeenCalled();
  });
});
