import type { NextRequest } from "next/server";

import { LICENSE, jsonResponse, optionsResponse } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rate-limit";
import { canonicalOrigin } from "@/lib/site";

/** What a client should be able to find without reading any documentation first. */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const origin = canonicalOrigin(request);

  return jsonResponse(
    request,
    {
      name: "BackToSSTV API",
      version: "v1",
      description:
        "Slow scan television transmissions from amateur satellites, curated by hand. Timestamps are UTC.",
      documentation: `${origin}/api-reference`,
      openapi: `${origin}/openapi.json`,
      license: LICENSE,
      // The one thing asked of a caller, said where a caller actually looks. It was only in the
      // terms, which nobody reads before writing a client, and a rule published where it is not
      // read is a rule that cannot fairly be enforced later.
      user_agent:
        "Please send a User-Agent naming your application and a way to reach you, such as AllmySat/2.3.0 (+https://allmysat.com). It is how we can warn you instead of blocking you.",
      endpoints: {
        events: `${origin}/api/v1/events`,
        live: `${origin}/api/v1/events/live`,
        upcoming: `${origin}/api/v1/events/upcoming`,
        past: `${origin}/api/v1/events/past`,
        event: `${origin}/api/v1/events/{id}`,
        satellites: `${origin}/api/v1/satellites`,
        satellite: `${origin}/api/v1/satellites/{norad_id}`,
        operators: `${origin}/api/v1/operators`,
        operator: `${origin}/api/v1/operators/{slug}`,
        deletions: `${origin}/api/v1/deletions`,
        dump: `${origin}/api/v1/dump.ndjson`,
        calendar: `${origin}/api/v1/events.ics`,
        // Version-independent on purpose: a monitor pointed here does not have to be moved the
        // day a `v2` exists. `/api/v1/health` answers the same thing.
        health: `${origin}/api/health`,
      },
    },
    null,
    limit.headers,
  );
}

export function OPTIONS() {
  return optionsResponse();
}
