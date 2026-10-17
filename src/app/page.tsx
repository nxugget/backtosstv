import type { Metadata } from "next";

import { HomeHero } from "@/components/home-hero";
import { loadEventPanel } from "@/lib/events-panel";
import { loadGlobeSatellites } from "@/lib/globe-data";

// The globe and the event panel read the live catalogue, so the page is rendered per request
// instead of being prerendered: the build must not need Supabase credentials (see ci.yml).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live SSTV tracker and free API",
  description:
    "Track slow-scan television transmissions from amateur satellites in real time, and integrate the curated event catalogue into any project for free.",
};

export default async function Home() {
  const [satellites, panel] = await Promise.all([loadGlobeSatellites(), loadEventPanel()]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center gap-10 px-3 py-14 sm:px-5 lg:px-8">
      <div className="flex max-w-2xl flex-col items-center gap-5 text-center">
        <h1 className="whitespace-nowrap text-2xl uppercase leading-none tracking-tighter text-ink [word-spacing:-0.25em] sm:text-4xl md:text-5xl xl:text-7xl">
          Back to SSTV
        </h1>

        <p className="text-xl text-signal sm:text-2xl">The open API for every SSTV pass.</p>

        <div className="mb-4 mt-2 flex flex-wrap items-center justify-center gap-3">
          <a
            className="inline-flex items-center justify-center rounded-lg bg-signal px-6 py-3 text-sm font-semibold text-void transition-colors hover:bg-signal-bright"
            href="/api-reference"
          >
            Start with the API
          </a>
          <a
            className="inline-flex items-center justify-center rounded-lg border border-signal px-6 py-3 text-sm font-semibold text-signal transition-colors hover:bg-signal hover:text-void"
            href="/api/v1/events.ics"
          >
            Add to calendar
          </a>
        </div>
      </div>

      <HomeHero
        initial={panel.initial}
        liveBySatellite={panel.liveBySatellite}
        satellites={satellites}
        upcomingBySatellite={panel.upcomingBySatellite}
      />
    </main>
  );
}
