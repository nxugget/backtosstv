/**
 * Server-only reader for the TLE database, which lives in its own Supabase project.
 *
 * The credentials come from `TLE_SUPABASE_URL` and `TLE_SUPABASE_KEY`, ordinary server environment
 * variables, never `NEXT_PUBLIC_` ones: this module runs only in server components and route
 * handlers, so the key never reaches the browser.
 */
interface TleRecord {
  line1: string;
  line2: string;
}

interface TleSatelliteRow {
  id: number;
  norad_id: number;
}

interface TleLineRow {
  satellite_id: number;
  tle_line1: string;
  tle_line2: string;
}

export async function fetchTlesForNoradIds(
  noradIds: readonly number[],
): Promise<Map<number, TleRecord>> {
  const url = process.env.TLE_SUPABASE_URL;
  const key = process.env.TLE_SUPABASE_KEY;
  const result = new Map<number, TleRecord>();

  if (url === undefined || url === "" || key === undefined || key === "" || noradIds.length === 0) {
    return result;
  }

  const base = url.replace(/\/+$/, "");

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    // The TLE database links `tle` rows to its own `satellites.id`, not to NORAD ids, so the join
    // goes through that table first.
    const satelliteParams = new URLSearchParams({
      norad_id: `in.(${noradIds.join(",")})`,
      select: "id,norad_id",
    });
    const satelliteResponse = await fetch(`${base}/rest/v1/satellites?${satelliteParams}`, {
      cache: "no-store",
      headers,
    });

    if (!satelliteResponse.ok) {
      throw new Error(`TLE satellites request failed with ${satelliteResponse.status}`);
    }

    const satelliteRows = (await satelliteResponse.json()) as TleSatelliteRow[];
    const idByNoradId = new Map<number, number>();

    for (const row of satelliteRows) {
      idByNoradId.set(row.norad_id, row.id);
    }

    const satelliteIds = [...idByNoradId.values()];

    if (satelliteIds.length === 0) {
      return result;
    }

    const tleParams = new URLSearchParams({
      satellite_id: `in.(${satelliteIds.join(",")})`,
      select: "satellite_id,tle_line1,tle_line2",
    });
    const tleResponse = await fetch(`${base}/rest/v1/tle?${tleParams}`, {
      cache: "no-store",
      headers,
    });

    if (!tleResponse.ok) {
      throw new Error(`TLE lines request failed with ${tleResponse.status}`);
    }

    const tleRows = (await tleResponse.json()) as TleLineRow[];
    const tleBySatelliteId = new Map<number, TleRecord>();

    for (const row of tleRows) {
      tleBySatelliteId.set(row.satellite_id, { line1: row.tle_line1, line2: row.tle_line2 });
    }

    for (const [noradId, satelliteId] of idByNoradId) {
      const tle = tleBySatelliteId.get(satelliteId);

      if (tle !== undefined) {
        result.set(noradId, tle);
      }
    }
  } catch (cause) {
    // The globe degrades to "no positions" rather than taking the homepage down with the TLE store.
    console.error("Failed to read TLEs", cause);
  }

  return result;
}
