import { beforeEach, describe, expect, it, vi } from "vitest";

import { readUptime, type FetchLike } from "@/lib/uptime";

/**
 * The monitoring API is somebody else's, so what is worth pinning is the edges: that the key goes
 * in the body rather than a URL, that a failure says why instead of showing an empty page, and
 * that every number on the page survives the trip from their shapes to ours.
 */

const KEY = "ur123456-readonly";

interface Recorded {
  body: URLSearchParams;
  url: string;
}

/** A `fetch` that answers with this payload and records what was sent. */
function fetchReturning(payload: unknown, calls: Recorded[], status = 200): FetchLike {
  return (input, init) => {
    const body = init.body;

    calls.push({
      body: body instanceof URLSearchParams ? body : new URLSearchParams(),
      url: input,
    });

    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
    );
  };
}

const MONITOR = {
  average_response_time: "412.8",
  custom_uptime_ratio: "100.000-99.880-99.421",
  friendly_name: "BackToSSTV API",
  logs: [
    { datetime: 1792243155, duration: 300, type: 2 },
    { datetime: 1792242855, duration: 300, type: 1 },
  ],
  status: 2,
};

beforeEach(() => {
  delete process.env.UPTIMEROBOT_API_KEY;
});

describe("readUptime", () => {
  it("says so plainly when no key is configured", async () => {
    expect(await readUptime()).toEqual({ kind: "unconfigured" });
  });

  it("treats a blank key as no key, rather than calling with nothing", async () => {
    process.env.UPTIMEROBOT_API_KEY = "   ";
    const calls: Recorded[] = [];

    expect(await readUptime(fetchReturning({ stat: "ok" }, calls))).toEqual({
      kind: "unconfigured",
    });
    expect(calls).toHaveLength(0);
  });

  it("sends the key in the body, never in the URL", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;
    const calls: Recorded[] = [];

    await readUptime(fetchReturning({ monitors: [], stat: "ok" }, calls));

    const call = calls[0];

    expect(call?.url).toBe("https://api.uptimerobot.com/v2/getMonitors");
    expect(call?.url).not.toContain(KEY);
    expect(call?.body.get("api_key")).toBe(KEY);
  });

  it("asks for the three windows the page shows, in that order", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;
    const calls: Recorded[] = [];

    await readUptime(fetchReturning({ monitors: [], stat: "ok" }, calls));

    expect(calls[0]?.body.get("custom_uptime_ratios")).toBe("1-7-30");
    expect(calls[0]?.body.get("logs")).toBe("1");
  });

  it("maps a monitor to what the page renders", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(fetchReturning({ monitors: [MONITOR], stat: "ok" }, []));

    expect(report.kind).toBe("ok");

    if (report.kind !== "ok") {
      return;
    }

    expect(report.monitors[0]).toMatchObject({
      averageResponseMs: 412.8,
      name: "BackToSSTV API",
      ratios: { day: 100, month: 99.421, week: 99.88 },
      state: "up",
    });
  });

  it("reads an event's instant from the epoch seconds the API reports", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(fetchReturning({ monitors: [MONITOR], stat: "ok" }, []));

    expect(report.kind === "ok" && report.monitors[0]?.events[0]).toEqual({
      at: "2026-10-17T13:19:15.000Z",
      durationSeconds: 300,
      kind: "up",
    });
    expect(report.kind === "ok" && report.monitors[0]?.events[1]?.kind).toBe("down");
  });

  it("reports an unfamiliar status as unknown rather than guessing it is fine", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(
      fetchReturning({ monitors: [{ ...MONITOR, status: 42 }], stat: "ok" }, []),
    );

    expect(report.kind === "ok" && report.monitors[0]?.state).toBe("unknown");
  });

  it("reads a paused monitor as paused, not as an outage", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(
      fetchReturning({ monitors: [{ ...MONITOR, status: 0 }], stat: "ok" }, []),
    );

    expect(report.kind === "ok" && report.monitors[0]?.state).toBe("paused");
  });

  it("survives a payload with none of the optional fields", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(fetchReturning({ monitors: [{}], stat: "ok" }, []));

    expect(report.kind === "ok" && report.monitors[0]).toEqual({
      averageResponseMs: null,
      events: [],
      name: "Monitor",
      ratios: { day: null, month: null, week: null },
      state: "unknown",
    });
  });

  it("passes the API's own complaint through, because it is the diagnosis", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    expect(
      await readUptime(
        fetchReturning({ error: { message: "api_key not found." }, stat: "fail" }, []),
      ),
    ).toEqual({ kind: "unreachable", reason: "the monitoring API said: api_key not found." });
  });

  it("reports a refusal by its status, and never quotes the key back", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;

    const report = await readUptime(fetchReturning({ error: KEY }, [], 429));

    expect(report).toEqual({
      kind: "unreachable",
      reason: "the monitoring API answered 429",
    });
    expect(JSON.stringify(report)).not.toContain(KEY);
  });

  it("reports a timeout as a timeout", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const timedOut = () => {
      const error = new Error("The operation was aborted due to timeout");

      error.name = "TimeoutError";

      return Promise.reject(error);
    };

    expect(await readUptime(timedOut)).toEqual({
      kind: "unreachable",
      reason: "the monitoring API did not answer in time",
    });
  });

  it("does not take the whole page down when the network does", async () => {
    process.env.UPTIMEROBOT_API_KEY = KEY;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await readUptime(() => Promise.reject(new Error("ECONNREFUSED")))).toEqual({
      kind: "unreachable",
      reason: "the monitoring API could not be reached",
    });
  });
});
