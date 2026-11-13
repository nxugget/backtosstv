import type { NextRequest } from "next/server";

import { eventPageResponse } from "@/lib/api/events-endpoint";
import { optionsResponse } from "@/lib/api/http";

/** `/events?status=past`, under the path a reader guesses first. */
export function GET(request: NextRequest) {
  return eventPageResponse(request, "past");
}

export function OPTIONS() {
  return optionsResponse();
}
