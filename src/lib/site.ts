import type { NextRequest } from "next/server";

/**
 * Where this deployment says it lives, or null when nothing says.
 *
 * A `Host` header is not an answer to that question: the caller sets it. The public API puts an
 * origin inside the bodies it returns (`next`, `previous`, the endpoint list on `/api/v1`), and
 * those bodies are cacheable and shared, so a forged host would be stored and handed to the next
 * caller as the place to fetch the catalogue from.
 */
export function configuredSiteOrigin(): string | null {
  const configured = process.env.SITE_URL?.trim();

  if (configured === undefined || configured === "") {
    return null;
  }

  return configured.replace(/\/+$/, "");
}

/**
 * The origin to publish in a response. `SITE_URL` when the deployment sets it, and the request's
 * own origin otherwise, which is what keeps a preview deployment and a local server pointing at
 * themselves rather than at production.
 */
export function canonicalOrigin(request: NextRequest): string {
  return configuredSiteOrigin() ?? request.nextUrl.origin;
}
