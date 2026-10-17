import type { NextRequest } from "next/server";

import { findSatellite } from "@/lib/api/catalogue";
import { single } from "@/lib/api/envelope";
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/api/http";
import { parseNoradId } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/satellites/[norad_id]">,
) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const { norad_id: rawNoradId } = await context.params;
  const noradId = parseNoradId(rawNoradId);

  if (noradId === null) {
    return errorResponse(
      request,
      400,
      "invalid_norad_id",
      "Invalid norad_id. Expected a positive integer, such as 25544.",
    );
  }

  try {
    const satellite = await findSatellite(noradId);

    if (satellite === null) {
      return errorResponse(request, 404, "not_found", "No satellite has that NORAD number.");
    }

    return jsonResponse(request, single(satellite), satellite.updated_at, limit.headers);
  } catch (cause) {
    return internalErrorResponse(request, "Failed to read a satellite", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
