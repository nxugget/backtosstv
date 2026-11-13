import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import type { EventQuery } from "@/lib/api/query";

/**
 * The generator is tested on its own in `calendar.test.ts`. What is tested here is the wiring, and
 * it is the wiring that broke: the route asked for five hundred events through the parser that
 * enforces the page ceiling of a hundred, so the endpoint answered `400` to everybody. Pure
 * functions with good tests either side of a route handler prove nothing about the handler.
 */
const mocks = vi.hoisted(() => ({
  listEvents: vi.fn<(query: EventQuery) => Promise<{ count: number; results: [] }>>(),
}));

vi.mock("@/lib/api/catalogue", () => ({
  lastModifiedOf: () => null,
  listEvents: mocks.listEvents,
}));

vi.mock("@/lib/api/rate-limit", () => ({
  rateLimit: () => Promise.resolve({ exceeded: null, headers: [] }),
}));

function request(query = "") {
  return new NextRequest(`https://backtosstv.test/api/v1/events.ics${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEvents.mockResolvedValue({ count: 0, results: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/events.ics", () => {
  it("answers a calendar, which is the thing a 400 was hiding", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(await response.text()).toContain("BEGIN:VCALENDAR");
  });

  it("asks for more events than a page of the API allows, since it is not a page", async () => {
    await GET(request());

    const query = mocks.listEvents.mock.calls[0]?.[0];

    expect(query?.limit).toBe(500);
    expect(query?.offset).toBe(0);
  });

  it("defaults to a window around now rather than the whole archive", async () => {
    await GET(request());

    const query = mocks.listEvents.mock.calls[0]?.[0];

    expect(query?.status).toBe("all");
    expect(Date.parse(query?.startAfter ?? "")).toBeLessThan(Date.now());
    expect(Date.parse(query?.startAfter ?? "")).toBeGreaterThan(Date.now() - 31 * 86400 * 1000);
  });

  it("leaves the window alone when the caller sets one end of it", async () => {
    await GET(request("?start_after=2020-01-01T00:00:00Z"));

    const query = mocks.listEvents.mock.calls[0]?.[0];

    expect(query?.startAfter).toBe("2020-01-01T00:00:00.000Z");
    expect(query?.status).toBe("upcoming");
  });

  it("carries the filters through", async () => {
    await GET(request("?norad_id=25544&operator=ariss&mode=PD120"));

    const query = mocks.listEvents.mock.calls[0]?.[0];

    expect(query?.noradId).toBe(25544);
    expect(query?.operator).toBe("ariss");
    expect(query?.mode).toBe("PD120");
  });

  it("ignores paging parameters rather than refusing them", async () => {
    const response = await GET(request("?limit=5000&offset=40"));

    expect(response.status).toBe(200);
    expect(mocks.listEvents.mock.calls[0]?.[0].limit).toBe(500);
  });

  it("still refuses a filter that is not valid", async () => {
    const response = await GET(request("?mode=nope"));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(body.error.code).toBe("invalid_mode");
    expect(body.error.message).toContain("PD120");
  });
});
