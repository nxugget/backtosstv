export type SatelliteEventKind = "live" | "upcoming" | "past";

export interface GlobeSatelliteEvent {
  frequencyMhz: number;
  kind: SatelliteEventKind;
  mode: string;
  startTime: string;
}

export interface GlobeSatellite {
  alternate_name: string | null;
  event: GlobeSatelliteEvent | null;
  name: string;
  norad_id: number;
  tle: { line1: string; line2: string } | null;
}
