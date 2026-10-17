import type { NextRequest } from "next/server";

import { eventPageResponse } from "@/lib/api/events-endpoint";
import { optionsResponse } from "@/lib/api/http";

export function GET(request: NextRequest) {
  return eventPageResponse(request, null);
}

export function OPTIONS() {
  return optionsResponse();
}
