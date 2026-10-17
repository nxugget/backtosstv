import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  isEventId,
  parseEventQuery,
  parseNoradId,
  parsePageQuery,
} from "@/lib/api/query";

function eventQuery(search: string) {
  return parseEventQuery(new URLSearchParams(search));
}

function failureCode(result: ReturnType<typeof eventQuery>): string | null {
  return result.ok ? null : result.failure.code;
}

describe("parseEventQuery", () => {
  it("defaults to the upcoming page", () => {
    const result = eventQuery("");

    expect(result.ok && result.value).toEqual({
      cancelled: null,
      limit: DEFAULT_LIMIT,
      mode: null,
      noradId: null,
      offset: 0,
      operator: null,
      since: null,
      startAfter: null,
      startBefore: null,
      status: "upcoming",
    });
  });

  it("accepts every documented status", () => {
    for (const status of ["upcoming", "live", "past", "all"]) {
      const result = eventQuery(`status=${status}`);

      expect(result.ok && result.value.status).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(failureCode(eventQuery("status=bogus"))).toBe("invalid_status");
  });

  it("rejects an empty status rather than treating it as absent", () => {
    expect(failureCode(eventQuery("status="))).toBe("invalid_status");
  });

  it("accepts the limit bounds and refuses what is outside them", () => {
    expect(eventQuery("limit=1").ok).toBe(true);
    expect(eventQuery(`limit=${MAX_LIMIT}`).ok).toBe(true);
    expect(failureCode(eventQuery("limit=0"))).toBe("invalid_limit");
    expect(failureCode(eventQuery(`limit=${MAX_LIMIT + 1}`))).toBe("invalid_limit");
  });

  it("refuses a limit that is not a plain integer", () => {
    expect(failureCode(eventQuery("limit=-1"))).toBe("invalid_limit");
    expect(failureCode(eventQuery("limit=1.5"))).toBe("invalid_limit");
    expect(failureCode(eventQuery("limit=ten"))).toBe("invalid_limit");
    expect(failureCode(eventQuery("limit=+5"))).toBe("invalid_limit");
  });

  it("refuses a negative offset but accepts zero", () => {
    expect(eventQuery("offset=0").ok).toBe(true);
    expect(failureCode(eventQuery("offset=-1"))).toBe("invalid_offset");
  });

  it("normalises since to an instant", () => {
    const result = eventQuery("since=2026-09-14T09:12:00%2B02:00");

    expect(result.ok && result.value.since).toBe("2026-09-14T07:12:00.000Z");
  });

  it("reads a time without a zone as UTC rather than as the server's zone", () => {
    const result = eventQuery("since=2026-09-14T09:12:00");

    expect(result.ok && result.value.since).toBe("2026-09-14T09:12:00.000Z");
  });

  it("takes a date on its own, which is the whole day from midnight UTC", () => {
    const result = eventQuery("since=2026-09-14");

    expect(result.ok && result.value.since).toBe("2026-09-14T00:00:00.000Z");
  });

  it("refuses what is not ISO 8601, rather than guessing at an instant", () => {
    // Every one of these parsed before, and three of them into a real date: a client got a page
    // that looked right and was filtered from the wrong moment.
    for (const value of [
      "yesterday",
      "2026",
      "Jan 1 2020",
      "09/14/2026",
      "2026-02-30",
      "2026-13-01",
      "2026-09-14T25:00:00Z",
    ]) {
      expect(failureCode(eventQuery(`since=${encodeURIComponent(value)}`))).toBe("invalid_since");
    }
  });

  it("takes an operator slug, and refuses something that is not one", () => {
    const result = eventQuery("operator=ariss");

    expect(result.ok && result.value.operator).toBe("ariss");
    expect(failureCode(eventQuery("operator=Not%20A%20Slug"))).toBe("invalid_operator");
    expect(failureCode(eventQuery("operator=x"))).toBe("invalid_operator");
  });

  it("takes a mode the database knows, and refuses one it does not", () => {
    const result = eventQuery("mode=PD120");

    expect(result.ok && result.value.mode).toBe("PD120");
    // Case matters: these are enum labels, not free text.
    expect(failureCode(eventQuery("mode=pd120"))).toBe("invalid_mode");
    expect(failureCode(eventQuery("mode=Robot%2099"))).toBe("invalid_mode");
  });

  it("takes an absolute window around start_time, each end reported on its own", () => {
    const result = eventQuery("start_after=2026-09-01&start_before=2026-09-30T23:59:59Z");

    expect(result.ok && result.value.startAfter).toBe("2026-09-01T00:00:00.000Z");
    expect(result.ok && result.value.startBefore).toBe("2026-09-30T23:59:59.000Z");
    expect(failureCode(eventQuery("start_after=soon"))).toBe("invalid_start_after");
    expect(failureCode(eventQuery("start_before=2026-02-30"))).toBe("invalid_start_before");
  });

  it("rejects a since that is not a date", () => {
    expect(failureCode(eventQuery("since=yesterday"))).toBe("invalid_since");
  });

  it("parses a norad_id filter", () => {
    const result = eventQuery("norad_id=25544");

    expect(result.ok && result.value.noradId).toBe(25544);
  });

  it("rejects a norad_id that is not a positive integer", () => {
    expect(failureCode(eventQuery("norad_id=0"))).toBe("invalid_norad_id");
    expect(failureCode(eventQuery("norad_id=-3"))).toBe("invalid_norad_id");
    expect(failureCode(eventQuery("norad_id=abc"))).toBe("invalid_norad_id");
  });

  it("reads the cancelled filter as a tri-state", () => {
    const absent = eventQuery("");
    const only = eventQuery("cancelled=true");
    const without = eventQuery("cancelled=false");

    expect(absent.ok && absent.value.cancelled).toBeNull();
    expect(only.ok && only.value.cancelled).toBe(true);
    expect(without.ok && without.value.cancelled).toBe(false);
    expect(failureCode(eventQuery("cancelled=1"))).toBe("invalid_cancelled");
  });

  it("reports the first offending parameter when several are wrong", () => {
    expect(failureCode(eventQuery("status=bogus&limit=0"))).toBe("invalid_status");
  });
});

describe("parsePageQuery", () => {
  it("defaults to the first page", () => {
    const result = parsePageQuery(new URLSearchParams(""));

    expect(result.ok && result.value).toEqual({ limit: DEFAULT_LIMIT, offset: 0, since: null });
  });

  it("validates its pagination like the events endpoint", () => {
    const result = parsePageQuery(new URLSearchParams("limit=1000"));

    expect(result.ok ? null : result.failure.code).toBe("invalid_limit");
  });
});

describe("isEventId", () => {
  it("accepts a UUID in either case", () => {
    expect(isEventId("0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f")).toBe(true);
    expect(isEventId("0F1D2C3B-4A59-4E6D-8B7C-1A2B3C4D5E6F")).toBe(true);
  });

  it("refuses anything else, so a bad path is a 400 and not a database error", () => {
    expect(isEventId("1")).toBe(false);
    expect(isEventId("not-a-uuid")).toBe(false);
    expect(isEventId("0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f ")).toBe(false);
    expect(isEventId("0f1d2c3b4a594e6d8b7c1a2b3c4d5e6f")).toBe(false);
  });
});

describe("parseNoradId", () => {
  it("accepts a catalogue number", () => {
    expect(parseNoradId("25544")).toBe(25544);
  });

  it("refuses zero, negatives, decimals and overlong numbers", () => {
    expect(parseNoradId("0")).toBeNull();
    expect(parseNoradId("-1")).toBeNull();
    expect(parseNoradId("2.5")).toBeNull();
    expect(parseNoradId("1000000000")).toBeNull();
  });
});
