import { healthHeadResponse, healthResponse } from "@/lib/api/health-endpoint";
import { optionsResponse } from "@/lib/api/http";

/** The version-independent one: this is the URL to point a monitor at. */
export function GET() {
  return healthResponse();
}

export function HEAD() {
  return healthHeadResponse();
}

export function OPTIONS() {
  return optionsResponse();
}
