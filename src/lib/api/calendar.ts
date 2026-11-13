import type { PublicEvent } from "@/lib/api/catalogue";
import { formatFrequency } from "@/lib/format";

/**
 * The events as a calendar anyone can subscribe to, per RFC 5545.
 *
 * Everything here is a pure function of the events and the calendar's own name, because almost all
 * of iCalendar is format rules a test can pin: lines folded at 75 octets, five characters escaped,
 * CRLF endings, and identifiers that stay the same across refetches so an update replaces an event
 * instead of adding a second one next to it.
 */

/** RFC 5545 section 3.1: a content line is at most 75 octets, continued by a leading space. */
const MAX_OCTETS = 75;

/** What a calendar client is told about how often to come back. */
const REFRESH = "PT1H";

export interface CalendarDetails {
  description: string;
  name: string;
  /** The URL this calendar was fetched from, which a client may offer to open. */
  source: string;
  /** Host for the `UID` domain, so an identifier is globally unique as the spec asks. */
  uidDomain: string;
}

export function toCalendar(events: readonly PublicEvent[], details: CalendarDetails): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BackToSSTV//API v1//EN",
    "CALSCALE:GREGORIAN",
    // The calendar is published, not an invitation anyone can reply to.
    "METHOD:PUBLISH",
    `NAME:${escapeText(details.name)}`,
    `X-WR-CALNAME:${escapeText(details.name)}`,
    `DESCRIPTION:${escapeText(details.description)}`,
    `X-WR-CALDESC:${escapeText(details.description)}`,
    // Everything in this catalogue is UTC, so the calendar never carries a timezone definition.
    "TIMEZONE-ID:UTC",
    "X-WR-TIMEZONE:UTC",
    `URL:${escapeText(details.source)}`,
    `SOURCE;VALUE=URI:${escapeText(details.source)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    `X-PUBLISHED-TTL:${REFRESH}`,
    ...events.flatMap((event) => eventLines(event, details.uidDomain)),
    "END:VCALENDAR",
  ];

  // CRLF, and a trailing one: the spec counts the break as part of the line.
  return `${lines.flatMap((line) => fold(line)).join("\r\n")}\r\n`;
}

function eventLines(event: PublicEvent, uidDomain: string): string[] {
  const cancelled = event.cancelled_at !== null;
  const summary = [
    satelliteName(event),
    event.mode,
    `${formatFrequency(event.frequency_mhz)} MHz`,
    cancelled ? "(cancelled)" : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return [
    "BEGIN:VEVENT",
    // The event's own id, so a refetch updates this event rather than adding another.
    `UID:${event.id}@${uidDomain}`,
    // Both derive from the row's own history, so an unchanged catalogue produces an identical file
    // and a cache has something to compare.
    `DTSTAMP:${toIcsStamp(event.updated_at)}`,
    `LAST-MODIFIED:${toIcsStamp(event.updated_at)}`,
    `CREATED:${toIcsStamp(event.created_at)}`,
    `SEQUENCE:${String(sequenceOf(event))}`,
    `DTSTART:${toIcsStamp(event.start_time)}`,
    `DTEND:${toIcsStamp(event.end_time)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description(event))}`,
    // A client that strikes through or hides a cancelled entry does it from this line, which is
    // what makes cancelling an event in the admin reach somebody's phone.
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:TRANSPARENT",
    "CATEGORIES:SSTV,AMATEUR RADIO",
    ...(event.source_url === null ? [] : [`URL:${escapeText(event.source_url)}`]),
    // `CONTACT` rather than `ORGANIZER`: the latter is a calendar address, and an event carrying one
    // is a meeting as far as some clients are concerned: Outlook will offer to accept or decline
    // a radio transmission. This is a published broadcast, and the operator is already in the
    // summary and the body; this is the place the spec keeps for naming who to ask.
    `CONTACT:${escapeText(contact(event))}`,
    "END:VEVENT",
  ];
}

function description(event: PublicEvent): string {
  const parts = [
    `Satellite: ${satelliteName(event)} (NORAD ${String(event.satellite.norad_id)})`,
    `Operator: ${event.operator.name}`,
    `Mode: ${event.mode}`,
    `Frequency: ${formatFrequency(event.frequency_mhz)} MHz`,
  ];

  if (event.transmit_power_watts !== null) {
    parts.push(`Power: ${String(event.transmit_power_watts)} W`);
  }

  if (event.image_interval_seconds !== null) {
    parts.push(`One image every ${String(event.image_interval_seconds)} s`);
  }

  if (event.title !== null) {
    parts.push(event.title);
  }

  if (event.cancelled_at !== null) {
    parts.push("This transmission was cancelled.");
  }

  if (event.source_url !== null) {
    parts.push(`Announced at ${event.source_url}`);
  }

  // Literal newlines in the body, which `escapeText` turns into the `\n` the spec wants.
  return parts.join("\n");
}

/**
 * Both names when they differ. A calendar entry is read once, out of context, by somebody who has
 * to recognise which satellite it is: `ISS (ZARYA)` answers that, and a preference cannot be asked.
 */
function satelliteName(event: PublicEvent): string {
  const { alternate_name: alternate, name } = event.satellite;

  return alternate === null || alternate === name ? name : `${name} (${alternate})`;
}

/** Who runs the transmission, and where to read more about them when they say. */
function contact(event: PublicEvent): string {
  const { name, url } = event.operator;

  return url === null ? name : `${name}, ${url}`;
}

/**
 * A revision number that has to grow every time the event changes, without anything storing it.
 *
 * Whole seconds between the row being written and last changed: zero for an event nobody has
 * touched, larger after every edit, and monotonic by construction. A calendar compares it against
 * the copy it holds and takes the higher one.
 */
function sequenceOf(event: PublicEvent): number {
  const created = Date.parse(event.created_at);
  const updated = Date.parse(event.updated_at);

  if (Number.isNaN(created) || Number.isNaN(updated) || updated <= created) {
    return 0;
  }

  return Math.floor((updated - created) / 1000);
}

/** `20260914T091200Z`: the spec's UTC form, with no punctuation. */
export function toIcsStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 section 3.3.11. The backslash first, or it would escape the escapes, and a literal
 * newline becomes `\n` because a raw one would end the content line.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Splits a content line so that no line exceeds 75 octets, continuations carrying a single leading
 * space which counts against their own budget.
 *
 * Measured in octets and split between code points: a line cut through the middle of a multi-byte
 * character is not UTF-8 any more, and an accented satellite name is enough to produce one.
 */
export function fold(line: string): string[] {
  const encoder = new TextEncoder();

  if (encoder.encode(line).length <= MAX_OCTETS) {
    return [line];
  }

  const folded: string[] = [];
  let current = "";
  let octets = 0;
  let budget = MAX_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;

    if (octets + size > budget) {
      folded.push(current);
      current = "";
      octets = 0;
      // The leading space of a continuation line is part of its 75.
      budget = MAX_OCTETS - 1;
    }

    current += character;
    octets += size;
  }

  folded.push(current);

  return folded.map((part, index) => (index === 0 ? part : ` ${part}`));
}
