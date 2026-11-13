import type { NextRequest } from "next/server";

import { eventPageResponse } from "@/lib/api/events-endpoint";
import { optionsResponse } from "@/lib/api/http";

/** `/events?status=upcoming`, under the path a reader guesses first. */
export function GET(request: NextRequest) {
  return eventPageResponse(request, "upcoming");
}

export function OPTIONS() {
  return optionsResponse();
}
