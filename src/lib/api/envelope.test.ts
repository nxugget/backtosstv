import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { collection, single } from "@/lib/api/envelope";

afterEach(() => {
  delete process.env.SITE_URL;
});

function page(url: string, limit: number, offset: number, count: number) {
  return collection(new NextRequest(url), { count, limit, offset, results: [] });
}

describe("collection", () => {
  it("has no links when everything fits on one page", () => {
    const result = page("https://backtosstv.test/api/v1/events", 20, 0, 3);

    expect(result.next).toBeNull();
    expect(result.previous).toBeNull();
  });

  it("links forward while rows remain", () => {
    expect(page("https://backtosstv.test/api/v1/events", 20, 0, 50).next).toBe(
      "https://backtosstv.test/api/v1/events?limit=20&offset=20",
    );
  });

  it("stops linking forward on the last page, including an exact fit", () => {
    expect(page("https://backtosstv.test/api/v1/events", 20, 40, 50).next).toBeNull();
    expect(page("https://backtosstv.test/api/v1/events", 20, 20, 40).next).toBeNull();
  });

  it("links back to the previous page", () => {
    expect(page("https://backtosstv.test/api/v1/events", 20, 40, 50).previous).toBe(
      "https://backtosstv.test/api/v1/events?limit=20&offset=20",
    );
  });

  it("links to the configured origin, not to the host the request carried", () => {
    process.env.SITE_URL = "https://backtosstv.org";

    expect(page("https://forged.test/api/v1/events?status=all", 20, 0, 50).next).toBe(
      "https://backtosstv.org/api/v1/events?status=all&limit=20&offset=20",
    );
  });

  it("clamps a backward link to the first page rather than going negative", () => {
    expect(page("https://backtosstv.test/api/v1/events", 20, 10, 50).previous).toBe(
      "https://backtosstv.test/api/v1/events?limit=20&offset=0",
    );
  });

  it("carries the other filters into the links", () => {
    const result = page(
      "https://backtosstv.test/api/v1/events?status=all&norad_id=25544&limit=5&offset=0",
      5,
      0,
      20,
    );

    expect(result.next).toBe(
      "https://backtosstv.test/api/v1/events?status=all&norad_id=25544&limit=5&offset=5",
    );
  });

  it("states the licence, so a client that reads one response knows the terms", () => {
    const result = page("https://backtosstv.test/api/v1/events", 20, 0, 0);

    expect(result.license.name).toBe("CC BY 4.0");
    expect(result.license.attribution).toContain("BackToSSTV");
  });
});

describe("single", () => {
  it("wraps one resource and states the licence too", () => {
    const result = single({ id: "abc" });

    expect(result.data).toEqual({ id: "abc" });
    expect(result.license.url).toBe("https://creativecommons.org/licenses/by/4.0/");
  });
});
