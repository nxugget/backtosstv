"use client";

import { geoBounds, geoGraticule, geoOrthographic, geoPath } from "d3-geo";
import { useEffect, useMemo, useRef } from "react";
import { eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";

import type { GlobeSatellite } from "@/lib/globe";

interface DottedGlobeProps {
  className?: string;
  /** Degrees of longitude per second. Deliberately slow: the globe is a backdrop, not a spinner. */
  rotationSpeed?: number;
  satellites?: readonly GlobeSatellite[];
  /** NORAD id of the satellite whose orbit is currently revealed, or null for none. */
  selectedNoradId?: number | null;
  /** Called when a marker is clicked, with the next selection (null toggles it off). */
  onSatelliteSelect?: (noradId: number | null) => void;
}

/** Degrees of lat/lon between dots. The attachment's 16 with this step looks right at 110m. */
const DOT_SPACING = 16;
const DOT_STEP = DOT_SPACING * 0.08;

const RIM_COLOR = "#d65a3e";
const GRATICULE_COLOR = "rgba(232, 220, 195, 0.16)";
const OUTLINE_COLOR = "rgba(232, 220, 195, 0.55)";
const DOT_COLOR = "#b3a48a";
const LABEL_COLOR = "#e8dcc3";

/** The colours the public site's legend already uses for each transmission state. */
const LIVE_COLOR = "#ff3b30";
const UPCOMING_COLOR = "#ff7a3d";
const QUIET_COLOR = "#7c7060";

interface LandDot {
  lat: number;
  lng: number;
}

interface PositionedSatellite {
  satrec: SatRec;
  satellite: GlobeSatellite;
}

interface MarkerHit {
  noradId: number;
  x: number;
  y: number;
}

interface SelectedState {
  noradId: number | null;
  track: { color: string; points: [number, number][] } | null;
}

/**
 * The halftone "wireframe dotted" globe, redrawn each frame as a flat orthographic projection so
 * the continents are made of dots. Land data is the same bundled `world-atlas` TopoJSON the 3D
 * globe uses, so nothing is fetched from a third party.
 */
export function DottedGlobe({
  className = "",
  onSatelliteSelect,
  rotationSpeed = 2,
  satellites = [],
  selectedNoradId = null,
}: DottedGlobeProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const land = useMemo(() => {
    const topology = landTopology as Topology;
    const landObject = topology.objects.land;

    if (landObject === undefined) {
      return null;
    }

    return feature(
      topology,
      landObject,
    ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry | null>;
  }, []);

  const dots = useMemo(() => {
    if (land === null) {
      return [];
    }

    const result: LandDot[] = [];

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
            result.push({ lat, lng });
          }
        }
      }
    }

    return result;
  }, [land]);

  const positioned = useMemo(() => {
    const result: PositionedSatellite[] = [];

    for (const satellite of satellites) {
      if (satellite.tle === null) {
        continue;
      }

      try {
        result.push({
          satrec: twoline2satrec(satellite.tle.line1, satellite.tle.line2),
          satellite,
        });
      } catch {
        // A malformed TLE row is skipped rather than taking the globe down.
      }
    }

    return result;
  }, [satellites]);

  const selectedStateRef = useRef<SelectedState>({ noradId: null, track: null });
  const onSelectRef = useRef(onSatelliteSelect);

  useEffect(() => {
    onSelectRef.current = onSatelliteSelect;
  }, [onSatelliteSelect]);

  useEffect(() => {
    if (selectedNoradId === null) {
      selectedStateRef.current = { noradId: null, track: null };

      return;
    }

    const found = positioned.find((entry) => entry.satellite.norad_id === selectedNoradId);

    selectedStateRef.current =
      found === undefined
        ? { noradId: null, track: null }
        : {
            noradId: selectedNoradId,
            track: {
              color: markerColor(found.satellite.event),
              points: computeGroundTrack(found.satrec),
            },
          };
  }, [positioned, selectedNoradId]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;

    if (wrapper === null || canvas === null || land === null) {
      return;
    }

    const context = canvas.getContext("2d");

    if (context === null) {
      return;
    }

    const labelFont = `13px ${monoFont()}`;

    let width = 0;
    let height = 0;
    const rotation: [number, number, number] = [0, 0, 0];
    let projection = geoOrthographic().scale(1).translate([0, 0]).clipAngle(90);
    let path = geoPath(projection, context);

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const radius = Math.min(width, height) / 2 - 12;

      projection = geoOrthographic()
        .scale(radius)
        .translate([width / 2, height / 2])
        .clipAngle(90)
        .rotate(rotation);
      path = geoPath(projection, context);
    };

    const render = () => {
      context.clearRect(0, 0, width, height);

      const radius = projection.scale();

      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
      context.strokeStyle = RIM_COLOR;
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      path(geoGraticule()());
      context.strokeStyle = GRATICULE_COLOR;
      context.lineWidth = 1;
      context.stroke();

      context.beginPath();
      for (const entry of land.features) {
        if (entry.geometry !== null) {
          path(entry.geometry);
        }
      }
      context.strokeStyle = OUTLINE_COLOR;
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = DOT_COLOR;
      for (const dot of dots) {
        const projected = projection([dot.lng, dot.lat]);

        if (projected === null) {
          continue;
        }

        context.beginPath();
        context.arc(projected[0], projected[1], 1.2, 0, 2 * Math.PI);
        context.fill();
      }

      const selection = selectedStateRef.current;

      if (selection.track !== null && selection.track.points.length > 0) {
        drawOrbitTrack(context, selection.track.points, projection, selection.track.color);
      }

      const now = new Date();
      hits = [];

      for (const { satrec, satellite } of positioned) {
        const positionAndVelocity = propagate(satrec, now);

        if (positionAndVelocity === null) {
          continue;
        }

        const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(now));
        // satellite.js answers in radians; d3-geo works in degrees.
        const longitude = (geodetic.longitude * 180) / Math.PI;
        const latitude = (geodetic.latitude * 180) / Math.PI;
        const projected = projection([longitude, latitude]);

        if (projected === null) {
          continue;
        }

        const [x, y] = projected;

        if (x < -24 || x > width + 24 || y < -24 || y > height + 24) {
          continue;
        }

        hits.push({ noradId: satellite.norad_id, x, y });
        drawTarget(
          context,
          x,
          y,
          markerColor(satellite.event),
          satellite.name,
          labelFont,
          satellite.norad_id === selection.noradId,
          satellite.event?.kind === "live",
        );
      }
    };

    let frame = 0;
    let last = performance.now();
    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startRotation: [number, number, number] = [0, 0, 0];
    let hits: MarkerHit[] = [];

    const tick = (now: number) => {
      const elapsed = Math.min(0.1, (now - last) / 1000);

      last = now;

      if (!dragging) {
        rotation[0] += rotationSpeed * elapsed;
        projection.rotate(rotation);
      }

      render();
      frame = requestAnimationFrame(tick);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const hit = hits.find((entry) => Math.hypot(entry.x - pointerX, entry.y - pointerY) <= 18);

      // A click on a marker selects it and reveals its orbit; anything else drags the globe.
      if (hit !== undefined) {
        onSelectRef.current?.(
          selectedStateRef.current.noradId === hit.noradId ? null : hit.noradId,
        );

        return;
      }

      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startRotation = [...rotation];
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }

      // Horizontal drag spins the globe, vertical drag tilts it. Latitude is clamped so the
      // globe cannot be flipped upside down past either pole.
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const sensitivity = 0.5;

      rotation[0] = startRotation[0] + dx * sensitivity;
      rotation[1] = clamp(startRotation[1] - dy * sensitivity, -90, 90);
      projection.rotate(rotation);
      render();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }

      dragging = false;
      pointerId = null;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    const observer = new ResizeObserver(resize);

    observer.observe(wrapper);
    resize();
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dots, land, positioned, rotationSpeed]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
    </div>
  );
}

/** Bounds a value between two limits. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function markerColor(event: GlobeSatellite["event"]): string {
  if (event?.kind === "live") {
    return LIVE_COLOR;
  }

  if (event?.kind === "upcoming") {
    return UPCOMING_COLOR;
  }

  return QUIET_COLOR;
}

/**
 * The public site's fonts are loaded through next/font, which gives the family a hashed name. The
 * canvas cannot use the Tailwind `font-mono` utility, so it asks the document for the resolved
 * family and falls back to any monospace when it is not there.
 */
function monoFont(): string {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-dotgothic16")
    .trim();

  return family === "" ? "monospace" : family;
}

/** A small retro crosshair: an outer ring, four ticks, and a centre dot. */
function drawTarget(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  font: string,
  selected: boolean,
  live: boolean,
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.5;

  const pulse = live ? 1 + 0.18 * Math.sin(Date.now() / 280) : 1;

  if (selected) {
    context.shadowColor = color;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(x, y, 13 * pulse, 0, 2 * Math.PI);
    context.setLineDash([2, 2]);
    context.stroke();
    context.setLineDash([]);
    context.shadowBlur = 0;
  }

  context.beginPath();
  context.arc(x, y, 6 * pulse, 0, 2 * Math.PI);
  context.stroke();

  const outer = 12 * pulse;
  const inner = 3 * pulse;

  context.beginPath();
  context.moveTo(x - outer, y);
  context.lineTo(x - inner, y);
  context.moveTo(x + inner, y);
  context.lineTo(x + outer, y);
  context.moveTo(x, y - outer);
  context.lineTo(x, y - inner);
  context.moveTo(x, y + inner);
  context.lineTo(x, y + outer);
  context.stroke();

  context.beginPath();
  context.arc(x, y, 2 * pulse, 0, 2 * Math.PI);
  context.fill();

  context.font = font;
  context.textBaseline = "middle";
  context.fillStyle = LABEL_COLOR;
  context.fillText(label, x + 16, y);
  context.restore();
}

/**
 * The satellite's ground track over one full orbit, sampled half before and half after now. This
 * is the "fingerprint" its pass draws across the Earth: a complete closed loop rather than the
 * moving point alone.
 */
function computeGroundTrack(satrec: SatRec): [number, number][] {
  const meanMotion = satrec.no;

  if (!Number.isFinite(meanMotion) || meanMotion <= 0) {
    return [];
  }

  const periodMs = ((2 * Math.PI) / meanMotion) * 60_000;
  const now = Date.now();
  const samples = 360;
  const points: [number, number][] = [];

  for (let index = 0; index <= samples; index += 1) {
    const time = new Date(now - periodMs / 2 + (periodMs * index) / samples);
    const positionAndVelocity = propagate(satrec, time);

    if (positionAndVelocity === null) {
      continue;
    }

    const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(time));

    points.push([(geodetic.longitude * 180) / Math.PI, (geodetic.latitude * 180) / Math.PI]);
  }

  return points;
}

/** Draws the selected satellite's ground track as a glowing, dashed retro orbit line. */
function drawOrbitTrack(
  context: CanvasRenderingContext2D,
  points: readonly [number, number][],
  projection: ReturnType<typeof geoOrthographic>,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.25;
  context.setLineDash([4, 3]);
  context.shadowColor = color;
  context.shadowBlur = 6;
  context.beginPath();

  let drawing = false;

  for (const point of points) {
    const projected = projection(point);

    if (projected === null) {
      drawing = false;
      continue;
    }

    if (drawing) {
      context.lineTo(projected[0], projected[1]);
    } else {
      context.moveTo(projected[0], projected[1]);
      drawing = true;
    }
  }

  context.stroke();
  context.restore();
}

function pointInGeometry(point: [number, number], geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

/** Outer ring minus any holes, as a point-in-polygon test in lon/lat space. */
function pointInPolygon(point: [number, number], rings: number[][][]): boolean {
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

function pointInRing([x, y]: [number, number], ring: number[][]): boolean {
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
