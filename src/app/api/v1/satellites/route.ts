import type { NextRequest } from "next/server";

import { lastModifiedOf, listSatellites } from "@/lib/api/catalogue";
import { collection } from "@/lib/api/envelope";
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/api/http";
import { parsePageQuery } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";

/** The satellite catalogue the events point at: a client can resolve a NORAD number without guessing. */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const query = parsePageQuery(request.nextUrl.searchParams);

  if (!query.ok) {
    return errorResponse(request, 400, query.failure.code, query.failure.message);
  }

  try {
    const page = await listSatellites(query.value);

    return jsonResponse(
      request,
      collection(request, { ...page, limit: query.value.limit, offset: query.value.offset }),
      lastModifiedOf(page.results.map((satellite) => satellite.updated_at)),
      limit.headers,
    );
  } catch (cause) {
    return internalErrorResponse(request, "Failed to list satellites", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
