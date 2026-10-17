import { listEvents, listSatellites } from "@/lib/api/catalogue";
import { NO_EVENT_FILTERS } from "@/lib/api/query";
import type { GlobeSatellite, GlobeSatelliteEvent } from "@/lib/globe";
import { fetchTlesForNoradIds } from "@/lib/tle";

/**
 * The satellites for a globe, each with its latest event and its TLE. Server-only: the TLE store's
 * credentials never reach the browser, so this has to run in a server component.
 */
export async function loadGlobeSatellites(): Promise<GlobeSatellite[]> {
  const [satellitesPage, livePage, upcomingPage, pastPage] = await Promise.all([
    listSatellites({ limit: 200, offset: 0, since: null }),
    listEvents({ ...NO_EVENT_FILTERS, cancelled: false, limit: 200, status: "live" }),
    listEvents({ ...NO_EVENT_FILTERS, cancelled: false, limit: 200, status: "upcoming" }),
    listEvents({ ...NO_EVENT_FILTERS, cancelled: false, limit: 200, status: "past" }),
  ]);

  const eventsByNoradId = new Map<number, GlobeSatelliteEvent>();

  for (const event of livePage.results) {
    eventsByNoradId.set(event.satellite.norad_id, {
      frequencyMhz: event.frequency_mhz,
      kind: "live",
      mode: event.mode,
      startTime: event.start_time,
    });
  }

  for (const event of upcomingPage.results) {
    if (!eventsByNoradId.has(event.satellite.norad_id)) {
      eventsByNoradId.set(event.satellite.norad_id, {
        frequencyMhz: event.frequency_mhz,
        kind: "upcoming",
        mode: event.mode,
        startTime: event.start_time,
      });
    }
  }

  // `past` comes back most-recent-first, so the first row per satellite is its latest event.
  for (const event of pastPage.results) {
    if (!eventsByNoradId.has(event.satellite.norad_id)) {
      eventsByNoradId.set(event.satellite.norad_id, {
        frequencyMhz: event.frequency_mhz,
        kind: "past",
        mode: event.mode,
        startTime: event.start_time,
      });
    }
  }

  const tles = await fetchTlesForNoradIds(satellitesPage.results.map((row) => row.norad_id));

  const satellites: GlobeSatellite[] = [];

  for (const row of satellitesPage.results) {
    const tle = tles.get(row.norad_id) ?? null;

    // Without a TLE there is no position, so the satellite stays off the globe.
    if (tle === null) {
      continue;
    }

    satellites.push({
      alternate_name: row.alternate_name,
      event: eventsByNoradId.get(row.norad_id) ?? null,
      name: row.name,
      norad_id: row.norad_id,
      tle,
    });
  }

  return satellites;
}
