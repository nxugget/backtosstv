import type { NextRequest } from "next/server";

import { lastModifiedOf, listDeletions } from "@/lib/api/catalogue";
import { collection } from "@/lib/api/envelope";
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/api/http";
import { parsePageQuery } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";

/**
 * What a client has to drop. Everything else about an event reaches a client through `?since=`,
 * which cannot report the one change that removes the row it would have reported on.
 */
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
    const page = await listDeletions(query.value);

    return jsonResponse(
      request,
      collection(request, { ...page, limit: query.value.limit, offset: query.value.offset }),
      lastModifiedOf(page.results.map((deletion) => deletion.deleted_at)),
      limit.headers,
    );
  } catch (cause) {
    return internalErrorResponse(request, "Failed to list deleted events", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
