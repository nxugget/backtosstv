import { listEvents, type PublicEvent } from "@/lib/api/catalogue";
import { NO_EVENT_FILTERS } from "@/lib/api/query";

export type PanelEventKind = "live" | "upcoming";

export interface PanelEvent {
  endTime: string;
  frequencyMhz: number;
  imageIntervalSeconds: number | null;
  imageUrl: string | null;
  kind: PanelEventKind;
  mode: string;
  noradId: number;
  operatorLogoUrl: string | null;
  operatorName: string;
  satelliteName: string;
  sourceUrl: string | null;
  startTime: string;
  title: string | null;
  transmitPowerWatts: number | null;
}

export interface EventPanelData {
  /** What the panel shows before any satellite is chosen: the live event, else the next one. */
  initial: PanelEvent | null;
  /** The transmissions happening now, keyed by satellite for the click lookup. */
  liveBySatellite: readonly PanelEvent[];
  /** The next scheduled event per satellite, soonest first. */
  upcomingBySatellite: readonly PanelEvent[];
}

/**
 * The two questions the home page's event panel asks: what is on now (or next), and what comes
 * next for any satellite the visitor clicks. Both come from the same upcoming page so the panel
 * and the globe agree.
 */
export async function loadEventPanel(): Promise<EventPanelData> {
  const [livePage, upcomingPage] = await Promise.all([
    listEvents({ ...NO_EVENT_FILTERS, cancelled: false, limit: 50, status: "live" }),
    listEvents({ ...NO_EVENT_FILTERS, cancelled: false, limit: 200, status: "upcoming" }),
  ]);

  const liveBySatellite = livePage.results.map((event) => toPanelEvent(event, "live"));
  const upcomingBySatellite = upcomingPage.results.map((event) => toPanelEvent(event, "upcoming"));

  const initial = liveBySatellite[0] ?? upcomingBySatellite[0] ?? null;

  return { initial, liveBySatellite, upcomingBySatellite };
}

function toPanelEvent(event: PublicEvent, kind: PanelEventKind): PanelEvent {
  return {
    endTime: event.end_time,
    frequencyMhz: event.frequency_mhz,
    imageIntervalSeconds: event.image_interval_seconds,
    imageUrl: event.image_url,
    kind,
    mode: event.mode,
    noradId: event.satellite.norad_id,
    operatorLogoUrl: event.operator.logo_url,
    operatorName: event.operator.name,
    satelliteName: event.satellite.name,
    sourceUrl: event.source_url,
    startTime: event.start_time,
    title: event.title,
    transmitPowerWatts: event.transmit_power_watts,
  };
}
