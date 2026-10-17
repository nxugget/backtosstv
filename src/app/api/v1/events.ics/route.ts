import type { NextRequest } from "next/server";

import { toCalendar } from "@/lib/api/calendar";
import { lastModifiedOf, listEvents } from "@/lib/api/catalogue";
import {
  calendarResponse,
  errorResponse,
  internalErrorResponse,
  optionsResponse,
} from "@/lib/api/http";
import { parseEventQuery } from "@/lib/api/query";
import { rateLimit } from "@/lib/api/rate-limit";
import { canonicalOrigin } from "@/lib/site";

/**
 * The transmissions as a calendar to subscribe to.
 *
 * This is the one output that reaches somebody who will never call an API: a radio amateur pastes
 * the URL into their calendar and the next pass arrives on their phone, with a reminder, and
 * leaves again when it is cancelled: `cancelled_at` becomes `STATUS:CANCELLED`, which clients
 * strike through or hide on their own.
 *
 * Every filter `/events` takes works here, so `?norad_id=25544` is a calendar of the ISS and
 * `?operator=ariss` one of ARISS's series. What differs is the default window: a calendar that
 * began at the first event ever published would mostly be history, so without `status` or
 * `start_after` it carries everything from a month ago onwards.
 */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * A subscription is refetched whole, several times a day, by a client that will not page. The cap
 * is what stops that being unbounded; at a handful of events a week it is years of catalogue.
 *
 * It is deliberately above `MAX_LIMIT`, the ceiling on a page of `/events`, because that ceiling
 * exists to keep a paged response small and this answer is not paged. So it is applied to the
 * parsed query rather than passed through the parser, which would refuse it.
 */
const MAX_EVENTS = 500;

export async function GET(request: NextRequest) {
  const limit = await rateLimit(request);

  if (limit.exceeded !== null) {
    return limit.exceeded;
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);

  // A default, not a rule: both parameters stay the caller's to set, and asking for the whole
  // archive is `?status=all&start_after=2020-01-01T00:00:00Z`.
  if (params.get("status") === null && params.get("start_after") === null) {
    const from = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    params.set("status", "all");
    params.set("start_after", from.toISOString());
  }

  // The calendar has one size, so paging parameters are not the caller's to set here.
  params.delete("limit");
  params.delete("offset");

  const query = parseEventQuery(params);

  if (!query.ok) {
    return errorResponse(request, 400, query.failure.code, query.failure.message);
  }

  try {
    const page = await listEvents({ ...query.value, limit: MAX_EVENTS, offset: 0 });
    const origin = canonicalOrigin(request);
    const calendar = toCalendar(page.results, {
      description:
        "Slow scan television transmissions from amateur satellites, curated by hand. Times are UTC. A cancelled transmission keeps its entry and is marked cancelled.",
      name: "BackToSSTV",
      source: `${origin}${request.nextUrl.pathname}${request.nextUrl.search}`,
      uidDomain: new URL(origin).host,
    });

    return calendarResponse(
      request,
      calendar,
      lastModifiedOf(page.results.map((event) => event.updated_at)),
      limit.headers,
    );
  } catch (cause) {
    return internalErrorResponse(request, "Failed to build the calendar", cause);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
