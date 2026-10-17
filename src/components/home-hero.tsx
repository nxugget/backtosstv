"use client";

import { useState } from "react";

import { DottedGlobe } from "@/components/dotted-globe";
import { EventPanel } from "@/components/event-panel";
import type { PanelEvent } from "@/lib/events-panel";
import type { GlobeSatellite } from "@/lib/globe";

interface HomeHeroProps {
  initial: PanelEvent | null;
  liveBySatellite: readonly PanelEvent[];
  satellites: readonly GlobeSatellite[];
  upcomingBySatellite: readonly PanelEvent[];
}

/**
 * The interactive half of the home page: the event panel on the left, the globe on the right. The
 * selection lives here so a click on a marker can swap the panel's content.
 */
export function HomeHero({
  initial,
  liveBySatellite,
  satellites,
  upcomingBySatellite,
}: HomeHeroProps) {
  const [selectedNoradId, setSelectedNoradId] = useState<number | null>(initial?.noradId ?? null);

  const selectedEvent = findPanelEvent(
    selectedNoradId,
    initial,
    liveBySatellite,
    upcomingBySatellite,
  );

  const emptyMessage =
    selectedNoradId === null
      ? "No SSTV events in the catalogue yet."
      : "No SSTV transmission scheduled for this satellite right now.";

  return (
    <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <EventPanel emptyMessage={emptyMessage} event={selectedEvent} />

      <div className="flex w-full flex-col items-center gap-5">
        <DottedGlobe
          className="h-[min(76vh,900px)] w-full"
          onSatelliteSelect={setSelectedNoradId}
          satellites={satellites}
          selectedNoradId={selectedNoradId}
        />

        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-dim">
          <LegendDot color="#ff3b30" label="Transmitting" />
          <LegendDot color="#ff7a3d" label="Next event" />
          <LegendDot color="#7c7060" label="Quiet" />
        </ul>
      </div>
    </div>
  );
}

/**
 * What the panel shows for a selection: the live transmission first, then the next scheduled one,
 * then nothing. A null selection falls back to the default event.
 */
function findPanelEvent(
  noradId: number | null,
  initial: PanelEvent | null,
  liveBySatellite: readonly PanelEvent[],
  upcomingBySatellite: readonly PanelEvent[],
): PanelEvent | null {
  if (noradId === null) {
    return initial;
  }

  return (
    liveBySatellite.find((event) => event.noradId === noradId) ??
    upcomingBySatellite.find((event) => event.noradId === noradId) ??
    null
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </li>
  );
}
