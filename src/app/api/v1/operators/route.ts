import type { NextRequest } from "next/server";

import { lastModifiedOf, listOperators } from "@/lib/api/catalogue";
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
 * The organisations behind the transmissions, ordered by name. Every event already names its
 * operator; this is what makes the other direction possible, and a slug resolvable without one.
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
    const page = await listOperators(query.value);

    return jsonResponse(
      request,
      collection(request, { ...page, limit: query.value.limit, offset: query.value.offset }),
      lastModifiedOf(page.results.map((operator) => operator.updated_at)),
      limit.headers,
    );
  } catch (cause) {
    return internalErrorResponse(request, "Failed to list operators", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
