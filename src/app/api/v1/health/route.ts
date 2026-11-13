import { healthHeadResponse, healthResponse } from "@/lib/api/health-endpoint";
import { optionsResponse } from "@/lib/api/http";

/**
 * The same answer as `/api/health`, under the version somebody browsing `v1` will have found it.
 * A monitor should use the other one, which outlives this version.
 */
export function GET() {
  return healthResponse();
}

export function HEAD() {
  return healthHeadResponse();
}

export function OPTIONS() {
  return optionsResponse();
}
