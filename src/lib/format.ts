const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatUtcTime(value: string): string {
  return TIME_FORMATTER.format(new Date(value));
}

export function formatUtcCalendarDate(value: string): string {
  return CALENDAR_FORMATTER.format(new Date(value));
}

export function formatFrequency(megahertz: number): string {
  return megahertz.toFixed(3);
}

/**
 * Renders an instant as the `datetime-local` value the UTC pickers use, e.g. `2026-09-14T12:30`.
 */
export function toUtcDateTimeInput(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return date.toISOString().slice(0, 16);
}

/**
 * Reads a UTC picker value back into an ISO instant, or null when it is empty or malformed.
 */
export function fromUtcDateTimeInput(value: string): string | null {
  if (value === "") {
    return null;
  }

  const date = new Date(`${value}Z`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
