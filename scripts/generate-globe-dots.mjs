import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { geoBounds } from "d3-geo";
import prettier from "prettier";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json" with { type: "json" };

const DOT_SPACING = 16;
const DOT_STEP = DOT_SPACING * 0.08;
const landObject = landTopology.objects.land;

if (landObject === undefined) {
  throw new Error("The world-atlas topology does not contain land geometry");
}

const land = feature(landTopology, landObject);
const dots = [];

for (const entry of land.features) {
  const geometry = entry.geometry;

  if (geometry === null) {
    continue;
  }

  const bounds = geoBounds(geometry);
  const minLng = bounds[0][0];
  const minLat = bounds[0][1];
  const maxLng = bounds[1][0];
  const maxLat = bounds[1][1];

  for (let lng = minLng; lng <= maxLng; lng += DOT_STEP) {
    for (let lat = minLat; lat <= maxLat; lat += DOT_STEP) {
      if (pointInGeometry([lng, lat], geometry)) {
        // Sub-millidegree precision is invisible at this spacing and removes loop drift.
        dots.push({ lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) });
      }
    }
  }
}

const output = {
  source: "world-atlas/land-110m.json",
  dotSpacingDegrees: DOT_STEP,
  dots,
};

const outputPath = new URL("../src/lib/globe-dots.json", import.meta.url);
const formatted = await prettier.format(JSON.stringify(output), {
  filepath: fileURLToPath(outputPath),
});

await writeFile(outputPath, formatted);

function pointInGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function pointInPolygon(point, rings) {
  const outer = rings[0];

  if (outer === undefined || !pointInRing(point, outer)) {
    return false;
  }

  for (let index = 1; index < rings.length; index += 1) {
    const hole = rings[index];

    if (hole !== undefined && pointInRing(point, hole)) {
      return false;
    }
  }

  return true;
}

function pointInRing([x, y], ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];

    if (current === undefined || previous === undefined) {
      continue;
    }

    const xi = current[0] ?? 0;
    const yi = current[1] ?? 0;
    const xj = previous[0] ?? 0;
    const yj = previous[1] ?? 0;

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}
