import { describe, expect, it } from "vitest";

import { escapeText, fold, toCalendar, toIcsStamp } from "@/lib/api/calendar";
import type { PublicEvent } from "@/lib/api/catalogue";

const EVENT: PublicEvent = {
  cancelled_at: null,
  created_at: "2026-09-13T18:00:00.000Z",
  title: "ARISS SSTV activity",
  end_time: "2026-09-14T09:24:00.000Z",
  frequency_mhz: 145.8,
  id: "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
  image_interval_seconds: 120,
  image_url: null,
  mode: "PD120",
  operator: { logo_url: null, name: "ARISS", slug: "ariss", url: "https://www.ariss.org/" },
  satellite: { alternate_name: "ZARYA", name: "ISS", norad_id: 25544 },
  source_url: "https://www.ariss.org/",
  start_time: "2026-09-14T09:12:00.000Z",
  transmit_power_watts: 10,
  updated_at: "2026-09-13T18:00:00.000Z",
};

const DETAILS = {
  description: "Transmissions from amateur satellites",
  name: "BackToSSTV",
  source: "https://backtosstv.org/api/v1/events.ics",
  uidDomain: "backtosstv.org",
};

/** Unfolded back into logical lines, which is how a client reads the file. */
function linesOf(calendar: string): string[] {
  return calendar
    .replace(/\r\n[ ]/g, "")
    .split("\r\n")
    .filter((line) => line !== "");
}

/**
 * Only the first event's lines. `DESCRIPTION` exists at both levels (the calendar has one too),
 * so a search over the whole file answers the wrong one.
 */
function eventLinesOf(calendar: string): string[] {
  const lines = linesOf(calendar);

  return lines.slice(lines.indexOf("BEGIN:VEVENT") + 1, lines.indexOf("END:VEVENT"));
}

function valueOf(lines: readonly string[], property: string): string | undefined {
  return lines
    .find((line) => line.startsWith(`${property}:`) || line.startsWith(`${property};`))
    ?.split(":")
    .slice(1)
    .join(":");
}

describe("toCalendar", () => {
  it("is a calendar object with one event inside it", () => {
    const lines = linesOf(toCalendar([EVENT], DETAILS));

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
  });

  it("ends every line with CRLF, including the last", () => {
    const calendar = toCalendar([EVENT], DETAILS);

    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar.split("\n").every((line) => line === "" || line.endsWith("\r"))).toBe(true);
  });

  it("keeps every line within 75 octets, which is the whole reason for folding", () => {
    const wordy: PublicEvent = {
      ...EVENT,
      title:
        "A long announcement that goes on for a while, with commas, semicolons; and enough words to force the folding of several content lines in a row.",
    };

    for (const line of toCalendar([wordy], DETAILS).split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("identifies an event by its own id, so a refetch updates rather than duplicates", () => {
    expect(valueOf(eventLinesOf(toCalendar([EVENT], DETAILS)), "UID")).toBe(
      "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f@backtosstv.org",
    );
  });

  it("writes the times as UTC stamps the spec recognises", () => {
    const event = eventLinesOf(toCalendar([EVENT], DETAILS));

    expect(valueOf(event, "DTSTART")).toBe("20260914T091200Z");
    expect(valueOf(event, "DTEND")).toBe("20260914T092400Z");
  });

  it("marks a cancelled transmission cancelled, which is what empties somebody's calendar", () => {
    const cancelled = eventLinesOf(
      toCalendar([{ ...EVENT, cancelled_at: "2026-09-13T20:00:00.000Z" }], DETAILS),
    );

    expect(valueOf(cancelled, "STATUS")).toBe("CANCELLED");
    expect(valueOf(cancelled, "SUMMARY")).toContain("(cancelled)");
    expect(valueOf(eventLinesOf(toCalendar([EVENT], DETAILS)), "STATUS")).toBe("CONFIRMED");
  });

  it("raises the revision number when an event has been edited, and only then", () => {
    expect(valueOf(eventLinesOf(toCalendar([EVENT], DETAILS)), "SEQUENCE")).toBe("0");

    const edited = eventLinesOf(
      toCalendar([{ ...EVENT, updated_at: "2026-09-13T18:01:00.000Z" }], DETAILS),
    );

    expect(valueOf(edited, "SEQUENCE")).toBe("60");
  });

  it("names the satellite so it can be recognised out of context", () => {
    expect(valueOf(eventLinesOf(toCalendar([EVENT], DETAILS)), "SUMMARY")).toBe(
      "ISS (ZARYA) · PD120 · 145.800 MHz",
    );

    const unnamed = { ...EVENT, satellite: { ...EVENT.satellite, alternate_name: null } };

    expect(valueOf(eventLinesOf(toCalendar([unnamed], DETAILS)), "SUMMARY")).toBe(
      "ISS · PD120 · 145.800 MHz",
    );
  });

  it("carries what a listener needs in the body, newlines escaped", () => {
    const description = valueOf(eventLinesOf(toCalendar([EVENT], DETAILS)), "DESCRIPTION") ?? "";

    expect(description).toContain("NORAD 25544");
    expect(description).toContain("145.800 MHz");
    expect(description).toContain("Power: 10 W");
    expect(description).toContain("\\n");
    expect(description).not.toMatch(/[\r\n]/);
  });

  it("names the operator without turning a broadcast into a meeting invitation", () => {
    const event = eventLinesOf(toCalendar([EVENT], DETAILS));

    // `ORGANIZER` is a calendar address, and an event that carries one is a meeting to some
    // clients: Outlook offers to accept or decline it.
    expect(event.some((line) => line.startsWith("ORGANIZER"))).toBe(false);
    expect(event.some((line) => line.startsWith("ATTENDEE"))).toBe(false);
    // Escaped on the wire, as the spec wants: a comma inside a text value would otherwise
    // separate two values.
    expect(valueOf(event, "CONTACT")).toBe("ARISS\\, https://www.ariss.org/");
  });

  it("answers an empty catalogue with an empty calendar rather than nothing", () => {
    const lines = linesOf(toCalendar([], DETAILS));

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).not.toContain("BEGIN:VEVENT");
  });
});

describe("escapeText", () => {
  it("escapes the five characters that would otherwise break a line", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });

  it("escapes the backslash first, so an escape is not escaped twice", () => {
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });
});

describe("fold", () => {
  it("leaves a short line alone", () => {
    expect(fold("SUMMARY:ISS")).toEqual(["SUMMARY:ISS"]);
  });

  it("continues a long line with a leading space, within budget each time", () => {
    const folded = fold(`SUMMARY:${"a".repeat(200)}`);

    expect(folded.length).toBeGreaterThan(1);
    expect(folded[0]).toHaveLength(75);
    expect(folded.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(folded.slice(1).every((line) => line.length <= 75)).toBe(true);
  });

  it("never splits a character in half, which would stop the file being UTF-8", () => {
    // Four octets each, so a naive split by characters would overrun and a split by bytes would
    // cut one in two.
    const folded = fold(`SUMMARY:${"🛰".repeat(40)}`);

    for (const line of folded) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }

    expect(folded.join("").replace(/ /g, "")).toBe(`SUMMARY:${"🛰".repeat(40)}`);
  });
});

describe("toIcsStamp", () => {
  it("drops the punctuation and the milliseconds", () => {
    expect(toIcsStamp("2026-09-14T09:12:00.000Z")).toBe("20260914T091200Z");
    expect(toIcsStamp("2026-09-14 09:12:00+00")).toBe("20260914T091200Z");
  });
});
