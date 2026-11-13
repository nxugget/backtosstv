import { describe, expect, it, vi } from "vitest";

import { GET as stable } from "./route";
import { GET as versioned } from "../v1/health/route";

const mocks = vi.hoisted(() => ({ pingCatalogue: vi.fn<() => Promise<number>>() }));

vi.mock("@/lib/api/catalogue", () => ({ pingCatalogue: mocks.pingCatalogue }));

/**
 * The two paths have to answer the same thing: a monitor is pointed at the version-independent one
 * and a reader finds the other in `v1`'s index, and neither should be the poor relation.
 */
describe("the two health paths", () => {
  it("answer identically", async () => {
    mocks.pingCatalogue.mockResolvedValue(7);

    const fromStable = await stable();
    const fromVersioned = await versioned();

    expect(fromStable.status).toBe(fromVersioned.status);
    expect(fromStable.headers.get("cache-control")).toBe(
      fromVersioned.headers.get("cache-control"),
    );

    const a = (await fromStable.json()) as { status: string };
    const b = (await fromVersioned.json()) as { status: string };

    expect(a.status).toBe(b.status);
  });
});
