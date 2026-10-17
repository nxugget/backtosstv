import { formatFrequency } from "@/lib/format";
import type { SatelliteOption } from "@/lib/shack";
import type { DatabaseClient } from "@/lib/supabase";

/**
 * The event form's picker choices, read through the caller's session so Row Level Security still
 * applies. The most recent event for each satellite rides along: choosing a satellite then prefills
 * the frequency, mode and image interval the previous event used.
 */
export async function listSatelliteOptions(
  supabase: DatabaseClient,
): Promise<readonly SatelliteOption[]> {
  const [{ data: satellites, error }, { data: latest, error: latestError }] = await Promise.all([
    supabase
      .from("satellites")
      .select("norad_id, name, alternate_name, default_operator_id")
      .order("name", { ascending: true }),
    supabase.rpc("latest_event_for_satellite"),
  ]);

  if (error !== null) {
    throw new Error(error.message);
  }

  if (latestError !== null) {
    throw new Error(latestError.message);
  }

  const latestBySatellite = new Map(latest.map((row) => [row.norad_id, row]));

  return satellites.map((satellite) => {
    const last = latestBySatellite.get(satellite.norad_id);

    return {
      alternateName: satellite.alternate_name,
      defaultOperatorId: satellite.default_operator_id,
      lastFrequency: last === undefined ? null : formatFrequency(last.frequency),
      lastImageIntervalSeconds:
        last?.image_interval_seconds == null ? null : String(last.image_interval_seconds),
      lastMode: last === undefined ? null : last.mode,
      name: satellite.name,
      noradId: satellite.norad_id,
    };
  });
}
