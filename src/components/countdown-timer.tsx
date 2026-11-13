"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  /** Colour of the big digits, e.g. the satellite's state colour. */
  color?: string;
  /** "Ends in" for a live event, "Starts in" for an upcoming one. */
  prefix: string;
  /** ISO instant the countdown runs towards. */
  target: string;
}

function format(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** A big pixel-style countdown, refreshed every second. */
export function Countdown({ color = "#d65a3e", prefix, target }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-ink-faint">{prefix}</span>
      <span className="font-mono text-4xl leading-none sm:text-5xl" style={{ color }}>
        {format(Date.parse(target) - now)}
      </span>
    </div>
  );
}
