import { NextResponse } from "next/server";

import { pingCatalogue } from "@/lib/api/catalogue";
import { publicHeaders } from "@/lib/api/http";

/**
 * Whether this API can answer, for whatever is watching it.
 *
 * Served at `/api/health` and at `/api/v1/health`. The first is the one to point a monitor at: a
 * monitoring URL has to outlive an API version, and the whole promise of `v1` is that it will one
 * day be joined by a `v2`, at which point a check aimed inside `v1` would be watching the old
 * version, or a path that has been retired. The versioned path stays because it is listed in `v1`'s
 * own index, where somebody exploring the API will find it.
 *
 * Deliberately outside the request budget. This is the one endpoint whose job is to answer when
 * things are going badly, and a monitor told `429` would report an outage that is not happening.
 * What stops that being a way in is the shared cache: five seconds of it absorb a flood, and the
 * question underneath is one `HEAD` for one column of one row.
 *
 * It does not use the error envelope the rest of the API answers with. A monitor reads the status
 * code, a person reads the body, and neither is making a bad request.
 */
const HEALTHY_CACHE_CONTROL = "public, max-age=5, s-maxage=5";

export async function healthResponse(): Promise<NextResponse> {
  const checkedAt = new Date().toISOString();

  try {
    const latency = await pingCatalogue();

    return answer(200, HEALTHY_CACHE_CONTROL, {
      status: "ok",
      checked_at: checkedAt,
      api_version: "v1",
      catalogue: { reachable: true, latency_ms: latency },
    });
  } catch (cause) {
    console.error("Health check failed", cause);

    // Never cached: an outage that ends should be visible on the next request, not in five seconds.
    return answer(503, "no-store", {
      status: "unavailable",
      checked_at: checkedAt,
      api_version: "v1",
      catalogue: { reachable: false, latency_ms: null },
    });
  }
}

/** The status and the headers, without the body a monitor was not going to read. */
export async function healthHeadResponse(): Promise<NextResponse> {
  const response = await healthResponse();

  return new NextResponse(null, { headers: response.headers, status: response.status });
}

function answer(status: number, cacheControl: string, body: unknown): NextResponse {
  const headers = publicHeaders();

  headers.set("Cache-Control", cacheControl);

  return NextResponse.json(body, { headers, status });
}
