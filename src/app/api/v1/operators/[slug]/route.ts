import type { NextRequest } from "next/server";

import { findOperator } from "@/lib/api/catalogue";
import { single } from "@/lib/api/envelope";
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rate-limit";
import { isOperatorSlug } from "@/lib/parse";

/** One operator, by the slug the events carry. */
export async function GET(request: NextRequest, context: RouteContext<"/api/v1/operators/[slug]">) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const { slug } = await context.params;

  if (!isOperatorSlug(slug)) {
    return errorResponse(
      request,
      400,
      "invalid_operator",
      "Invalid operator. Expected the slug of an operator, such as ariss.",
      // What the caller sent here is a path segment, which the document calls `slug`.
      "slug",
    );
  }

  try {
    const operator = await findOperator(slug);

    if (operator === null) {
      return errorResponse(request, 404, "not_found", "No operator has that slug.");
    }

    return jsonResponse(request, single(operator), operator.updated_at, limit.headers);
  } catch (cause) {
    return internalErrorResponse(request, "Failed to read an operator", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
