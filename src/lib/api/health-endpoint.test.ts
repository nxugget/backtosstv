import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { healthHeadResponse, healthResponse } from "@/lib/api/health-endpoint";

const mocks = vi.hoisted(() => ({ pingCatalogue: vi.fn<() => Promise<number>>() }));

vi.mock("@/lib/api/catalogue", () => ({ pingCatalogue: mocks.pingCatalogue }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("healthResponse", () => {
  it("says what it checked and how long the catalogue took", async () => {
    mocks.pingCatalogue.mockResolvedValue(12);

    const response = await healthResponse();
    const body = (await response.json()) as {
      api_version: string;
      catalogue: { latency_ms: number; reachable: boolean };
      checked_at: string;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.api_version).toBe("v1");
    expect(body.catalogue).toEqual({ latency_ms: 12, reachable: true });
    expect(Number.isNaN(Date.parse(body.checked_at))).toBe(false);
  });

  it("answers 503 when the catalogue cannot be reached, which is the point of it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.pingCatalogue.mockRejectedValue(new Error("the database is not answering"));

    const response = await healthResponse();
    const body = (await response.json()) as { catalogue: { reachable: boolean }; status: string };

    expect(response.status).toBe(503);
    expect(body.status).toBe("unavailable");
    expect(body.catalogue.reachable).toBe(false);
  });

  it("lets a cache hold a healthy answer briefly and a failing one not at all", async () => {
    mocks.pingCatalogue.mockResolvedValue(12);

    expect((await healthResponse()).headers.get("cache-control")).toBe(
      "public, max-age=5, s-maxage=5",
    );

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.pingCatalogue.mockRejectedValue(new Error("down"));

    // An outage that ends has to be visible on the next request, not in five seconds.
    expect((await healthResponse()).headers.get("cache-control")).toBe("no-store");
  });

  it("is readable from a status page on another origin", async () => {
    mocks.pingCatalogue.mockResolvedValue(1);

    expect((await healthResponse()).headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("healthHeadResponse", () => {
  it("carries the status and no body", async () => {
    mocks.pingCatalogue.mockResolvedValue(3);

    const response = await healthHeadResponse();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
