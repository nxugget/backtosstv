import type { NextRequest } from "next/server";

import { findEvent } from "@/lib/api/catalogue";
import { single } from "@/lib/api/envelope";
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/api/http";
import { isEventId } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";

/** So a client that cached an event can refresh that one event instead of the whole catalogue. */
export async function GET(request: NextRequest, context: RouteContext<"/api/v1/events/[id]">) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const { id } = await context.params;

  if (!isEventId(id)) {
    return errorResponse(request, 400, "invalid_id", "Invalid id. Expected the UUID of an event.");
  }

  try {
    const event = await findEvent(id);

    if (event === null) {
      return errorResponse(request, 404, "not_found", "No event has that id.");
    }

    return jsonResponse(request, single(event), event.updated_at, limit.headers);
  } catch (cause) {
    return internalErrorResponse(request, "Failed to read an sstv_event", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
