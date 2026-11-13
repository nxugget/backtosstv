"use client";

import Link from "next/link";
import { useSyncExternalStore, useState } from "react";

import { NavLink } from "@/components/nav-link";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TICK_MS = 1000;

function subscribe(onStoreChange: () => void): () => void {
  const timer = setInterval(onStoreChange, TICK_MS);

  return () => {
    clearInterval(timer);
  };
}

function formatUtc(now: Date): string {
  const day = DAYS[now.getUTCDay()];
  const date = String(now.getUTCDate()).padStart(2, "0");
  const month = MONTHS[now.getUTCMonth()];
  const year = now.getUTCFullYear();
  const time = now.toISOString().slice(11, 19);

  return `${day} ${date} ${month} ${year} · ${time} UTC`;
}

function getSnapshot(): string {
  return formatUtc(new Date());
}

function getServerSnapshot(): string {
  return "UTC";
}

function UtcDateTime() {
  const label = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return <span className="text-base uppercase tracking-wider text-signal">{label}</span>;
}

export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = (): void => {
    setMenuOpen(false);
  };

  return (
    <div className="sticky top-0 z-40">
      <header className="border-b border-signal bg-void/95 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-x-3 px-3 sm:gap-x-5">
          <Link
            className="font-body text-xl uppercase leading-none tracking-wider text-signal transition-colors hover:text-signal-bright"
            href="/"
          >
            BackToSSTV
          </Link>

          <span aria-hidden="true" className="hidden w-px self-stretch bg-signal sm:block" />

          <nav aria-label="Primary" className="hidden items-center gap-x-6 text-base sm:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/api-reference">API</NavLink>
            <NavLink external href="https://github.com/nxugget/backtosstv">
              GitHub
            </NavLink>
            <NavLink href="/credits">Credits</NavLink>
            <NavLink href="/status">Status</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3 self-stretch sm:gap-5">
            <span aria-hidden="true" className="hidden w-px self-stretch bg-signal sm:block" />
            <a
              className="inline-flex items-center gap-1.5 rounded-full border border-signal px-3 py-1 text-sm uppercase tracking-wider text-signal transition-colors hover:bg-signal hover:text-void"
              href="https://github.com/sponsors/nxugget"
              rel="noreferrer"
              target="_blank"
            >
              <span aria-hidden="true">♥</span>
              Sponsor
            </a>
            <span aria-hidden="true" className="hidden w-px self-stretch bg-signal sm:block" />
            <span className="hidden md:block">
              <UtcDateTime />
            </span>
            <button
              type="button"
              aria-controls="mobile-nav"
              aria-expanded={menuOpen}
              className="text-base uppercase tracking-wider text-signal sm:hidden"
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              {menuOpen ? "[ close ]" : "[ menu ]"}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="mobile-nav"
            className="flex flex-col gap-3 border-t border-signal/40 bg-void/95 px-5 py-4 sm:hidden"
          >
            <NavLink href="/" onClick={closeMenu}>
              Home
            </NavLink>
            <NavLink href="/api-reference" onClick={closeMenu}>
              API
            </NavLink>
            <NavLink external href="https://github.com/nxugget/backtosstv" onClick={closeMenu}>
              GitHub
            </NavLink>
            <NavLink href="/credits" onClick={closeMenu}>
              Credits
            </NavLink>
            <NavLink href="/status" onClick={closeMenu}>
              Status
            </NavLink>
          </div>
        ) : null}
      </header>
    </div>
  );
}
