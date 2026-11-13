import type { NextRequest } from "next/server";

import { lastModifiedOf, listEvents } from "@/lib/api/catalogue";
import { collection } from "@/lib/api/envelope";
import { errorResponse, internalErrorResponse, jsonResponse } from "@/lib/api/http";
import { parseEventQuery, type StatusFilter } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";

/**
 * One page of events, for `/events` and for the three paths that fix its `status`.
 *
 * The aliases exist so that the obvious URL works for somebody exploring the API, and so that each
 * window gets its own cache key. They hold no logic of their own: `fixedStatus` is written over
 * whatever the query string asked for, and everything below this line is the same code, so the
 * paths cannot drift apart from the filter they stand for.
 */
export async function eventPageResponse(
  request: NextRequest,
  fixedStatus: StatusFilter | null,
): Promise<Response> {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);

  if (fixedStatus !== null) {
    params.set("status", fixedStatus);
  }

  const query = parseEventQuery(params);

  if (!query.ok) {
    return errorResponse(request, 400, query.failure.code, query.failure.message);
  }

  try {
    const page = await listEvents(query.value);

    return jsonResponse(
      request,
      collection(request, { ...page, limit: query.value.limit, offset: query.value.offset }),
      lastModifiedOf(page.results.map((event) => event.updated_at)),
      limit.headers,
    );
  } catch (cause) {
    return internalErrorResponse(request, "Failed to list sstv_events", cause);
  }
}
