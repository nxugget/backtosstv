"use client";

import { useState } from "react";

import { shackInputClass, shackLabelClass } from "@/components/shack/styles";
import type { SatelliteOption } from "@/lib/shack";

interface SatelliteFieldProps {
  onChange: (value: SatelliteOption) => void;
  onRequestNew: () => void;
  options: readonly SatelliteOption[];
  value: SatelliteOption | null;
}

export function SatelliteField({ onChange, onRequestNew, options, value }: SatelliteFieldProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = options.filter((option) => matchesQuery(option, needle));

  return (
    <div className="flex flex-col gap-2 sm:max-w-2xl">
      <label className={shackLabelClass} htmlFor="satellite_search">
        Satellite
      </label>
      <input
        id="satellite_search"
        type="search"
        autoComplete="off"
        className={shackInputClass}
        placeholder="Filter satellites"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <ul className="max-h-64 divide-y divide-edge-soft overflow-y-auto rounded-lg border border-edge-soft bg-panel/40">
        {matches.map((option) => {
          const selected = value?.noradId === option.noradId;

          return (
            <li key={option.noradId}>
              <button
                type="button"
                aria-pressed={selected}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  selected
                    ? "bg-signal/15 text-signal-bright"
                    : "text-ink hover:bg-panel/60 active:bg-panel"
                }`}
                onClick={() => {
                  onChange(option);
                }}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm">{option.name}</span>
                  {option.alternateName === null ? null : (
                    <span className="text-xs opacity-70">{option.alternateName}</span>
                  )}
                </span>
                <span className="font-mono text-sm text-ink-faint">{option.noradId}</span>
              </button>
            </li>
          );
        })}
        {matches.length === 0 ? (
          <li className="px-3.5 py-2.5 text-sm text-ink-faint">
            No satellite matches that filter.
          </li>
        ) : null}
        <li className="border-t border-edge-soft">
          <button
            type="button"
            className="w-full px-3.5 py-2.5 text-left text-sm text-signal hover:bg-panel/60 active:bg-panel"
            onClick={onRequestNew}
          >
            + Add new satellite
          </button>
        </li>
      </ul>
    </div>
  );
}

/** The alternate name is shown in the list, so it has to be searchable: "Zarya" must find the ISS. */
function matchesQuery(option: SatelliteOption, needle: string): boolean {
  if (needle === "") {
    return true;
  }

  return (
    option.name.toLowerCase().includes(needle) ||
    (option.alternateName?.toLowerCase().includes(needle) ?? false) ||
    String(option.noradId).includes(needle)
  );
}
