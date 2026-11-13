import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  budgetKeyOf,
  clientOf,
  countInPostgres,
  countInRedis,
  rateLimit,
  readRedisConfig,
  resetRateLimitBreaker,
  type FetchLike,
  type RequestCounter,
} from "@/lib/api/rate-limit";

interface RpcReply {
  data: unknown;
  error: { message: string } | null;
}

const rpc = vi.hoisted(() =>
  vi.fn<(name: string, args: Record<string, number | string>) => Promise<RpcReply>>(),
);

/** The deadlines the counter was called with, so a test can check it is given one. */
const rpcDeadlines = vi.hoisted(() => ({ signals: [] as AbortSignal[] }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServiceRoleClient: () => ({
    // The real builder is awaited through `abortSignal()`, which is what carries the deadline, so
    // the fake answers the same way round.
    rpc: (name: string, args: Record<string, number | string>) => {
      const reply = rpc(name, args);

      return {
        abortSignal(signal: AbortSignal) {
          rpcDeadlines.signals.push(signal);

          return reply;
        },
      };
    },
  }),
}));

const URL_UNDER_TEST = "https://backtosstv.test/api/v1/events";

function request(headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7" }) {
  return new NextRequest(URL_UNDER_TEST, { headers });
}

/** A store that always answers with the same total. */
function counting(total: number): RequestCounter {
  return vi.fn<RequestCounter>().mockResolvedValue(total);
}

/** A store that cannot say, which is every way one can fail. */
const silent: RequestCounter = () => Promise.resolve(null);

function quietConsole() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

afterEach(() => {
  resetRateLimitBreaker();
  rpc.mockReset();
  rpcDeadlines.signals = [];
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.RATE_LIMIT_PER_MINUTE;
  vi.restoreAllMocks();
});

describe("rateLimit", () => {
  it("allows a request inside the budget and reports what is left", async () => {
    const result = await rateLimit(request(), counting(3));
    const headers = new Map(result.headers);

    expect(result.exceeded).toBeNull();
    expect(headers.get("RateLimit-Limit")).toBe("120");
    expect(headers.get("RateLimit-Remaining")).toBe("117");
    expect(Number(headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
    expect(Number(headers.get("RateLimit-Reset"))).toBeLessThanOrEqual(60);
  });

  it("allows the request that exactly spends the budget", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "10";

    const result = await rateLimit(request(), counting(10));

    expect(result.exceeded).toBeNull();
    expect(new Map(result.headers).get("RateLimit-Remaining")).toBe("0");
  });

  it("refuses the one after that, and says when to come back", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "10";

    const result = await rateLimit(request(), counting(11));

    expect(result.exceeded?.status).toBe(429);
    expect(result.exceeded?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(result.exceeded?.headers.get("cache-control")).toBe("no-store");
    expect(result.exceeded?.headers.get("ratelimit-remaining")).toBe("0");
  });

  it("refuses with the documented error shape, naming the cure", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "10";

    const result = await rateLimit(request(), counting(99));
    const body: unknown = await result.exceeded?.json();

    expect(body).toMatchObject({ error: { code: "rate_limited" } });
    expect((body as { error: { message: string } }).error.message).toContain("If-None-Match");
  });

  it("lets a browser client read the refusal", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "1";

    const result = await rateLimit(request(), counting(5));

    expect(result.exceeded?.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("counts the caller the platform saw, not the whole forwarded chain", async () => {
    const counter = counting(1);

    await rateLimit(request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }), counter);

    expect(counter).toHaveBeenCalledWith("203.0.113.7");
  });

  it("does not count a caller it cannot identify, rather than sharing one budget", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "1";

    const counter = counting(99);
    const result = await rateLimit(request({}), counter);

    expect(result.exceeded).toBeNull();
    expect(result.headers).toEqual([]);
    expect(counter).not.toHaveBeenCalled();
  });

  it("allows the request when the store cannot say, with no budget headers", async () => {
    const result = await rateLimit(request(), silent);

    expect(result.exceeded).toBeNull();
    expect(result.headers).toEqual([]);
  });

  it("ignores a configured limit that is not a positive integer", async () => {
    for (const value of ["0", "-5", "abc", "1.5", ""]) {
      process.env.RATE_LIMIT_PER_MINUTE = value;

      const result = await rateLimit(request(), counting(1));

      expect(new Map(result.headers).get("RateLimit-Limit")).toBe("120");
    }
  });

  it("takes a configured limit", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "600";

    const result = await rateLimit(request(), counting(1));

    expect(new Map(result.headers).get("RateLimit-Limit")).toBe("600");
  });
});

/**
 * Failing open costs a round trip, and a hanging store costs the whole timeout. Paying that on
 * every request for as long as the store is down would make the limiter the outage.
 */
describe("rateLimit, when the store stays broken", () => {
  it("stops asking after a few consecutive failures", async () => {
    quietConsole();

    const counter = vi.fn<RequestCounter>().mockImplementation(() => {
      // Mirrors what a real counter does on failure: records it and allows the request.
      return countInPostgres("203.0.113.7");
    });

    rpc.mockResolvedValue({ data: null, error: { message: "ECONNREFUSED" } });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await rateLimit(request(), counter);

      expect(result.exceeded).toBeNull();
    }

    // Three probes, then the store is left alone for the cooldown.
    expect(counter).toHaveBeenCalledTimes(3);
  });

  it("counts again as soon as the store answers", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "10";
    quietConsole();

    const counter = vi
      .fn<RequestCounter>()
      .mockImplementationOnce(() => countInPostgres("a"))
      .mockImplementationOnce(() => countInPostgres("a"))
      .mockResolvedValue(4);

    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });

    await rateLimit(request(), counter);
    await rateLimit(request(), counter);

    const recovered = await rateLimit(request(), counter);

    expect(new Map(recovered.headers).get("RateLimit-Remaining")).toBe("6");

    // The two earlier failures must not count towards pausing now that it is answering again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await rateLimit(request(), counter);
    }

    expect(counter).toHaveBeenCalledTimes(8);
  });
});

describe("countInRedis", () => {
  const redis = { token: "token", url: "https://redis.test" };

  /** Answers as the Upstash REST pipeline does: the counter first. A fresh body per call. */
  function redisCounting(count: number) {
    return vi
      .fn<FetchLike>()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 }),
        ),
      );
  }

  it("asks once, with both commands and the bearer token", async () => {
    const fetchImpl = redisCounting(7);
    const count = await countInRedis(redis, "203.0.113.7", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const body = typeof init?.body === "string" ? init.body : "";
    const commands = JSON.parse(body) as string[][];

    expect(count).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(url).toBe("https://redis.test/pipeline");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token" });
    expect(commands.map((command) => command[0])).toEqual(["INCR", "EXPIRE"]);
  });

  it("keys by caller and by window, so the expiry can be set unconditionally", async () => {
    const fetchImpl = redisCounting(1);

    await countInRedis(redis, "203.0.113.7", fetchImpl);
    await countInRedis(redis, "198.51.100.4", fetchImpl);

    const keys = fetchImpl.mock.calls.map((call) => {
      const body = typeof call[1].body === "string" ? call[1].body : "";

      return (JSON.parse(body) as string[][])[0]?.[1] ?? "";
    });

    expect(keys[0]).toContain("203.0.113.7");
    expect(keys[1]).toContain("198.51.100.4");
    expect(keys[0]).toMatch(/:\d+$/);
  });

  it("does not double the slash when the configured URL has a trailing one", async () => {
    const fetchImpl = redisCounting(1);

    await countInRedis({ token: "t", url: "https://redis.test/" }, "a", fetchImpl);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://redis.test/pipeline");
  });

  it("cannot say when the store is unreachable", async () => {
    quietConsole();

    const count = await countInRedis(
      redis,
      "a",
      vi.fn<FetchLike>().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    expect(count).toBeNull();
  });

  it("cannot say when the store answers an error status", async () => {
    quietConsole();

    const count = await countInRedis(
      redis,
      "a",
      vi.fn<FetchLike>().mockResolvedValue(new Response("nope", { status: 500 })),
    );

    expect(count).toBeNull();
  });

  it("cannot say when the store answers something unexpected", async () => {
    quietConsole();

    for (const body of ["{}", "[]", '[{"result":"three"}]', '[{"nope":1}]', "not json"]) {
      const count = await countInRedis(
        redis,
        "a",
        vi.fn<FetchLike>().mockResolvedValue(new Response(body, { status: 200 })),
      );

      expect(count).toBeNull();
      resetRateLimitBreaker();
    }
  });
});

describe("countInPostgres", () => {
  it("returns the total the database counted", async () => {
    rpc.mockResolvedValue({ data: 5, error: null });

    expect(await countInPostgres("203.0.113.7")).toBe(5);
    expect(rpc).toHaveBeenCalledWith("count_api_request", {
      p_client: "203.0.113.7",
      p_window_seconds: 60,
    });
  });

  it("gives the counter a deadline, since the limiter must never hold up the read", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    await countInPostgres("203.0.113.7");

    expect(rpcDeadlines.signals[0]).toBeInstanceOf(AbortSignal);
    expect(rpcDeadlines.signals[0]?.aborted).toBe(false);
  });

  it("cannot say when the database refuses", async () => {
    quietConsole();
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    expect(await countInPostgres("a")).toBeNull();
  });

  it("cannot say when the database answers nothing useful", async () => {
    quietConsole();
    rpc.mockResolvedValue({ data: 0, error: null });

    expect(await countInPostgres("a")).toBeNull();
  });

  it("cannot say when the call throws", async () => {
    quietConsole();
    rpc.mockRejectedValue(new Error("socket hang up"));

    expect(await countInPostgres("a")).toBeNull();
  });
});

describe("readRedisConfig", () => {
  it("is absent until credentials are set, which is when Postgres does the counting", () => {
    expect(readRedisConfig()).toBeNull();
  });

  it("reads Upstash's variable names", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    expect(readRedisConfig()).toEqual({ token: "token", url: "https://redis.test" });
  });

  it("reads Vercel KV's names too, so the hosting choice stays open", () => {
    process.env.KV_REST_API_URL = "https://kv.test";
    process.env.KV_REST_API_TOKEN = "kv-token";

    expect(readRedisConfig()).toEqual({ token: "kv-token", url: "https://kv.test" });
  });

  it("ignores a half-configured store rather than failing every request", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";

    expect(readRedisConfig()).toBeNull();
  });
});

describe("clientOf", () => {
  it("takes the first hop of a forwarded chain", () => {
    expect(clientOf(request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7");
  });

  it("prefers the header the platform sets, which a proxy of our own cannot overwrite", () => {
    expect(
      clientOf(
        request({
          "x-forwarded-for": "198.51.100.5",
          "x-real-ip": "198.51.100.6",
          "x-vercel-forwarded-for": "203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientOf(request({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("gives up rather than lumping unidentifiable callers together", () => {
    expect(clientOf(request({}))).toBeNull();
    expect(clientOf(request({ "x-forwarded-for": "" }))).toBeNull();
    expect(clientOf(request({ "x-forwarded-for": "  " }))).toBeNull();
  });

  it("counts a whole IPv6 subscriber as one caller, since they are handed a /64", () => {
    const first = clientOf(request({ "x-forwarded-for": "2001:db8:1234:5678:1:2:3:4" }));

    expect(first).toBe("2001:db8:1234:5678::/64");
    expect(clientOf(request({ "x-forwarded-for": "2001:db8:1234:5678:ffff::1" }))).toBe(first);
    expect(clientOf(request({ "x-forwarded-for": "2001:db8:1234:5679::1" }))).not.toBe(first);
  });

  it("reads the compressed and bracketed forms of an address the same way", () => {
    expect(clientOf(request({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8:0:0::/64");
    expect(clientOf(request({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8:0:0::/64");
    expect(clientOf(request({ "x-forwarded-for": "fe80::1%eth0" }))).toBe("fe80:0:0:0::/64");
  });
});

describe("budgetKeyOf", () => {
  it("leaves an IPv4 address alone", () => {
    expect(budgetKeyOf("203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys whole anything it cannot read as an IPv6 address, rather than truncating it", () => {
    // Truncating what we have not understood is how every caller ends up in one bucket.
    expect(budgetKeyOf("::ffff:203.0.113.7")).toBe("::ffff:203.0.113.7");
    expect(budgetKeyOf("2001:db8::zz::1")).toBe("2001:db8::zz::1");
    expect(budgetKeyOf("not an address")).toBe("not an address");
  });

  it("bounds the key, so a store never holds whatever a header felt like sending", () => {
    expect(budgetKeyOf("x".repeat(500))).toHaveLength(64);
  });
});
