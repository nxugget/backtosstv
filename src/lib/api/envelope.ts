import type { NextRequest } from "next/server";

import { LICENSE } from "@/lib/api/http";
import type { Pagination } from "@/lib/api/query";
import { canonicalOrigin } from "@/lib/site";

interface Collection<T> extends Pagination {
  count: number;
  license: typeof LICENSE;
  next: string | null;
  previous: string | null;
  results: readonly T[];
}

interface CollectionInput<T> extends Pagination {
  count: number;
  results: readonly T[];
}

/**
 * The shape every list endpoint answers with. `next` and `previous` are absolute, so a client can
 * walk the catalogue without reassembling query strings, and every other parameter of the request
 * is carried over.
 */
export function collection<T>(
  request: NextRequest,
  { count, limit, offset, results }: CollectionInput<T>,
): Collection<T> {
  return {
    count,
    limit,
    offset,
    next: offset + limit < count ? pageUrl(request, limit, offset + limit) : null,
    previous: offset === 0 ? null : pageUrl(request, limit, Math.max(0, offset - limit)),
    license: LICENSE,
    results,
  };
}

export function single<T>(resource: T): { data: T; license: typeof LICENSE } {
  return { data: resource, license: LICENSE };
}

function pageUrl(request: NextRequest, limit: number, offset: number): string {
  // The path and query come from the request; the origin does not. See `canonicalOrigin`.
  const url = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    canonicalOrigin(request),
  );

  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  return url.toString();
}
