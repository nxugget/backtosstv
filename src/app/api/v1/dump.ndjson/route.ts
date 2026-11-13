import type { NextRequest } from "next/server";

import { latestCatalogueChange, streamCatalogue } from "@/lib/api/catalogue";
import { LICENSE, internalErrorResponse, ndjsonResponse, optionsResponse } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rate-limit";
import { canonicalOrigin } from "@/lib/site";

/**
 * The whole catalogue in one file, so that holding a copy of it is one request rather than five
 * hundred.
 *
 * Paging the list endpoints to read everything costs an exact `COUNT` per page, the most
 * expensive query here, and spends a request budget meant for clients asking about transmissions.
 * This answers once, the shared cache keeps it for an hour, and the origin does the work once in
 * that hour however many mirrors ask.
 *
 * It is a snapshot, not a subscription: `generated_at` is the watermark to carry into `?since=` on
 * the events and on the deletions feed, which is where staying current happens.
 */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  try {
    const lastModified = await latestCatalogueChange();
    const generatedAt = new Date().toISOString();

    return ndjsonResponse(
      request,
      lastModified,
      lines(canonicalOrigin(request), generatedAt),
      limit.headers,
    );
  } catch (cause) {
    // Only what happens before the first byte can still be answered with a status code.
    return internalErrorResponse(request, "Failed to begin the catalogue dump", cause);
  }
}

/**
 * The headers of the dump without the dump: what a mirror asks for to find out whether anything has
 * moved. Answering a `HEAD` by running the `GET` and discarding the body would read the whole
 * catalogue to produce nothing.
 */
export async function HEAD(request: NextRequest) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  try {
    return ndjsonResponse(request, await latestCatalogueChange(), nothing(), limit.headers);
  } catch (cause) {
    return internalErrorResponse(request, "Failed to read the catalogue's last change", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}

/**
 * A manifest, then the catalogue, then a record saying how much of it there was.
 *
 * The last line is the only way a reader can tell a complete dump from one cut short: once the
 * stream has begun, a failure cannot change the status code.
 */
async function* lines(origin: string, generatedAt: string) {
  const since = encodeURIComponent(generatedAt);

  yield {
    type: "manifest",
    generated_at: generatedAt,
    api_version: "v1",
    source: `${origin}/api/v1/dump.ndjson`,
    record_types: ["manifest", "operator", "satellite", "event", "end"],
    license: LICENSE,
    // Where to go next, so a mirror is not left to work out on its own how to stay current.
    synchronise: {
      changed: `${origin}/api/v1/events?status=all&since=${since}`,
      deleted: `${origin}/api/v1/deletions?since=${since}`,
    },
  };

  const counts = { event: 0, operator: 0, satellite: 0 };

  for await (const record of streamCatalogue()) {
    counts[record.type] += 1;

    yield record;
  }

  yield { type: "end", counts, generated_at: generatedAt };
}

async function* nothing() {
  // A HEAD carries the headers and no body, so there is nothing to yield.
}
