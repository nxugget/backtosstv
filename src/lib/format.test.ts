import { describe, expect, it } from "vitest";

import {
  formatFrequency,
  formatUtcCalendarDate,
  formatUtcTime,
  fromUtcDateTimeInput,
  toUtcDateTimeInput,
} from "@/lib/format";

describe("formatUtcTime", () => {
  it("reads the clock in UTC, not in the host time zone", () => {
    expect(formatUtcTime("2026-09-14T09:12:00Z")).toBe("09:12");
  });

  it("converts an offset instant to UTC", () => {
    expect(formatUtcTime("2026-09-14T11:12:00+02:00")).toBe("09:12");
  });

  it("formats midnight as 00:00 rather than 24:00", () => {
    expect(formatUtcTime("2026-09-14T00:00:00Z")).toBe("00:00");
  });
});

describe("formatUtcCalendarDate", () => {
  // The month name comes from ICU and its abbreviation has changed between CLDR releases, so these
  // assert the shape and the day rather than a spelling that depends on the Node build.
  it("formats a day, a month and a four-digit year", () => {
    expect(formatUtcCalendarDate("2026-09-14T09:12:00Z")).toMatch(/^14 \p{L}+ 2026$/u);
  });

  it("keeps the UTC day when the local day differs", () => {
    expect(formatUtcCalendarDate("2026-09-14T23:30:00-04:00")).toBe(
      formatUtcCalendarDate("2026-09-15T00:00:00Z"),
    );
  });
});

describe("formatFrequency", () => {
  it("pads to three decimals, the convention on the bands", () => {
    expect(formatFrequency(145.8)).toBe("145.800");
  });

  it("rounds beyond three decimals", () => {
    expect(formatFrequency(145.8004)).toBe("145.800");
    expect(formatFrequency(145.8006)).toBe("145.801");
  });
});

describe("toUtcDateTimeInput", () => {
  it("renders the value a datetime-local input expects", () => {
    expect(toUtcDateTimeInput("2026-09-14T09:12:34Z")).toBe("2026-09-14T09:12");
  });

  it("accepts a Date as well as a string", () => {
    expect(toUtcDateTimeInput(new Date("2026-09-14T09:12:00Z"))).toBe("2026-09-14T09:12");
  });

  it("expresses a non-UTC instant in UTC", () => {
    expect(toUtcDateTimeInput("2026-09-14T11:12:00+02:00")).toBe("2026-09-14T09:12");
  });
});

describe("fromUtcDateTimeInput", () => {
  it("reads a picker value as UTC rather than local time", () => {
    expect(fromUtcDateTimeInput("2026-09-14T09:12")).toBe("2026-09-14T09:12:00.000Z");
  });

  it("round-trips with toUtcDateTimeInput", () => {
    const instant = "2026-09-14T09:12:00.000Z";

    expect(fromUtcDateTimeInput(toUtcDateTimeInput(instant))).toBe(instant);
  });

  it("returns null for an empty field", () => {
    expect(fromUtcDateTimeInput("")).toBeNull();
  });

  it("returns null for a malformed value", () => {
    expect(fromUtcDateTimeInput("not-a-date")).toBeNull();
    expect(fromUtcDateTimeInput("2026-13-45T99:99")).toBeNull();
  });
});
