import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  errorResponse,
  jsonResponse,
  ndjsonResponse,
  optionsResponse,
  publicHeaders,
  requestId,
} from "@/lib/api/http";

const URL_UNDER_TEST = "https://backtosstv.test/api/v1/events";

function request(headers: Record<string, string> = {}) {
  return new NextRequest(URL_UNDER_TEST, { headers });
}

describe("jsonResponse", () => {
  it("answers with the body and a validator", async () => {
    const response = jsonResponse(request(), { count: 0 }, null);

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^"[\w-]+"$/);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ count: 0 });
  });

  it("derives the validator from the body, so equal bodies share it", () => {
    const first = jsonResponse(request(), { count: 1 }, null);
    const second = jsonResponse(request(), { count: 1 }, null);
    const third = jsonResponse(request(), { count: 2 }, null);

    expect(first.headers.get("etag")).toBe(second.headers.get("etag"));
    expect(first.headers.get("etag")).not.toBe(third.headers.get("etag"));
  });

  it("answers 304 with no body when the caller already holds it", async () => {
    const etag = jsonResponse(request(), { count: 1 }, null).headers.get("etag") ?? "";
    const response = jsonResponse(request({ "if-none-match": etag }), { count: 1 }, null);

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe(etag);
  });

  it("still answers 200 when the held validator is for other data", () => {
    const stale = jsonResponse(request(), { count: 99 }, null).headers.get("etag") ?? "";

    expect(jsonResponse(request({ "if-none-match": stale }), { count: 1 }, null).status).toBe(200);
  });

  it("answers 304 to a caller whose date is not older than the page", () => {
    const lastModified = "2026-09-14T09:12:00.000Z";
    const held = { "if-modified-since": "Mon, 14 Sep 2026 09:12:00 GMT" };

    expect(jsonResponse(request(held), { count: 1 }, lastModified).status).toBe(304);
    expect(
      jsonResponse(
        request({ "if-modified-since": "Sun, 13 Sep 2026 09:12:00 GMT" }),
        { count: 1 },
        lastModified,
      ).status,
    ).toBe(200);
  });

  it("ignores a date when the response does not carry one, rather than guessing", () => {
    const held = { "if-modified-since": "Mon, 14 Sep 2026 09:12:00 GMT" };

    expect(jsonResponse(request(held), { count: 1 }, null).status).toBe(200);
    expect(
      jsonResponse(
        request({ "if-modified-since": "whenever" }),
        { count: 1 },
        "2026-09-14T09:12:00.000Z",
      ).status,
    ).toBe(200);
  });

  it("accepts a weakened validator and a list, which caches are allowed to send", () => {
    const etag = jsonResponse(request(), { count: 1 }, null).headers.get("etag") ?? "";

    expect(jsonResponse(request({ "if-none-match": `W/${etag}` }), { count: 1 }, null).status).toBe(
      304,
    );
    expect(
      jsonResponse(request({ "if-none-match": `"other", ${etag}` }), { count: 1 }, null).status,
    ).toBe(304);
    expect(jsonResponse(request({ "if-none-match": "*" }), { count: 1 }, null).status).toBe(304);
  });

  it("reports the newest change as Last-Modified, and omits it when there is none", () => {
    const dated = jsonResponse(request(), { count: 1 }, "2026-09-14T09:12:00.000Z");

    expect(dated.headers.get("last-modified")).toBe("Mon, 14 Sep 2026 09:12:00 GMT");
    expect(jsonResponse(request(), { count: 0 }, null).headers.get("last-modified")).toBeNull();
  });

  it("is cacheable by shared caches, and survives an origin that is not answering", () => {
    const cacheControl = jsonResponse(request(), { count: 0 }, null).headers.get("cache-control");

    expect(cacheControl).toContain("s-maxage=");
    expect(cacheControl).toContain("stale-while-revalidate=");
    expect(cacheControl).toContain("stale-if-error=");
  });
});

describe("ndjsonResponse", () => {
  /** A record at a time, each after a turn of the loop, the way a database hands them over. */
  async function* records(...values: unknown[]) {
    for (const value of values) {
      yield await Promise.resolve(value);
    }
  }

  async function linesOf(response: Response): Promise<string[]> {
    return (await response.text()).split("\n").filter((line) => line !== "");
  }

  it("writes one JSON object per line, each parseable on its own", async () => {
    const response = ndjsonResponse(request(), null, records({ a: 1 }, { b: [2, 3] }));
    const lines = await linesOf(response);

    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ a: 1 }, { b: [2, 3] }]);
  });

  it("ends every line, so the last record is not left dangling", async () => {
    const response = ndjsonResponse(request(), null, records({ a: 1 }, { a: 2 }));

    expect(await response.text()).toBe('{"a":1}\n{"a":2}\n');
  });

  it("carries no validator, because hashing the body would mean holding it", () => {
    const response = ndjsonResponse(request(), null, records({ a: 1 }));

    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(response.headers.get("cache-control")).toContain("stale-if-error=");
  });

  it("answers a mirror that already holds this copy with 304 and no body", async () => {
    const lastModified = "2026-09-14T09:12:00.000Z";
    const held = { "if-modified-since": "Mon, 14 Sep 2026 09:12:00 GMT" };

    const fresh = ndjsonResponse(request(held), lastModified, records({ a: 1 }));

    expect(fresh.status).toBe(304);
    expect(await fresh.text()).toBe("");
    expect(fresh.headers.get("last-modified")).toBe("Mon, 14 Sep 2026 09:12:00 GMT");

    const stale = { "if-modified-since": "Sun, 13 Sep 2026 09:12:00 GMT" };

    expect(ndjsonResponse(request(stale), lastModified, records({ a: 1 })).status).toBe(200);
  });

  it("lets any origin read it, like every other endpoint", () => {
    const response = ndjsonResponse(request(), null, records({ a: 1 }));

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("publicHeaders", () => {
  it("lets any origin read the catalogue and see the cache validators", () => {
    const headers = publicHeaders();

    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("access-control-expose-headers")).toContain("ETag");
  });

  it("points at the licence in a header as well as in the body", () => {
    expect(publicHeaders().get("link")).toBe(
      '<https://creativecommons.org/licenses/by/4.0/>; rel="license"',
    );
  });
});

describe("errorResponse", () => {
  it("reports a stable code with a human message, and is never cached", async () => {
    const response = errorResponse(
      request({ "x-request-id": "req-7" }),
      400,
      "invalid_limit",
      "Invalid limit.",
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_limit",
        message: "Invalid limit.",
        parameter: "limit",
        request_id: "req-7",
      },
    });
  });

  it("names the parameter a failure is about, derived from the code", async () => {
    const body: unknown = await errorResponse(
      request(),
      400,
      "invalid_start_before",
      "Invalid start_before.",
    ).json();

    expect(body).toMatchObject({ error: { parameter: "start_before" } });
  });

  it("names no parameter where the failure is about the request as a whole", async () => {
    const body: unknown = await errorResponse(
      request(),
      404,
      "not_found",
      "No event has that id.",
    ).json();

    expect(body).toMatchObject({ error: { parameter: null } });
  });

  it("takes a parameter name the code cannot know, such as a path segment", async () => {
    const body: unknown = await errorResponse(
      request(),
      400,
      "invalid_operator",
      "Invalid operator.",
      "slug",
    ).json();

    expect(body).toMatchObject({ error: { parameter: "slug" } });
  });

  it("carries the request id in a header as well as in the body", async () => {
    const response = errorResponse(request(), 500, "internal_error", "The catalogue.");
    const body = (await response.json()) as { error: { request_id: string } };

    expect(response.headers.get("x-request-id")).toBe(body.error.request_id);
    expect(body.error.request_id).not.toBe("");
  });

  it("carries the CORS headers too, so a browser client can read the error", () => {
    const response = errorResponse(request(), 404, "not_found", "No event has that id.");

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    // Without this a browser client can read the status but not the id it would quote in a report.
    expect(response.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
  });
});

describe("requestId", () => {
  it("keeps the id a client sent, so both sides name the same request", () => {
    expect(requestId(request({ "x-request-id": "01HZ.client-7" }))).toBe("01HZ.client-7");
  });

  it("falls back to the id the platform logs under", () => {
    expect(requestId(request({ "x-vercel-id": "cdg1::iad1::abc-1700000000000-0f1d2c3b" }))).toBe(
      "cdg1::iad1::abc-1700000000000-0f1d2c3b",
    );
  });

  it("prefers the client's id, which is the one that client can look up", () => {
    expect(requestId(request({ "x-request-id": "mine", "x-vercel-id": "theirs" }))).toBe("mine");
  });

  // A newline cannot get this far, since the runtime refuses to build the header at all, but a space
  // can, and the id is read out of a log line where a second word is a second field.
  it("refuses an id that would read as two fields in a log line", () => {
    expect(requestId(request({ "x-request-id": "ok request_id=someone-else" }))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("refuses an id too long to be one", () => {
    expect(requestId(request({ "x-request-id": "a".repeat(201) }))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers the same id every time for one request", () => {
    const once = request();

    expect(requestId(once)).toBe(requestId(once));
  });

  it("invents a different id for a different request", () => {
    expect(requestId(request())).not.toBe(requestId(request()));
  });
});

describe("optionsResponse", () => {
  it("answers a preflight with no content", () => {
    const response = optionsResponse();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
