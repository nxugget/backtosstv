import { describe, expect, it } from "vitest";

import {
  isUuid,
  parseHttpUrl,
  parseIntegerInRange,
  parseNumberInRange,
  parsePositiveInteger,
  parsePositiveNumber,
  readText,
} from "@/lib/parse";

function form(entries: Record<string, string | File>): FormData {
  const formData = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    formData.set(name, value);
  }

  return formData;
}

describe("readText", () => {
  it("trims, which is what makes the trimmed-name constraints satisfiable", () => {
    expect(readText(form({ name: "  ISS  " }), "name")).toBe("ISS");
  });

  it("reads a missing field as empty", () => {
    expect(readText(form({}), "name")).toBe("");
  });

  it("reads a file as empty rather than as its filename", () => {
    expect(readText(form({ name: new File(["x"], "iss.jpg") }), "name")).toBe("");
  });
});

describe("isUuid", () => {
  it("accepts a UUID in either case and refuses anything else", () => {
    expect(isUuid("0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("0F1D2C3B-4A59-4E6D-8B7C-1A2B3C4D5E6F")).toBe(true);
    expect(isUuid("")).toBe(false);
    expect(isUuid("1")).toBe(false);
    expect(isUuid("0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6g")).toBe(false);
  });
});

describe("parsePositiveInteger", () => {
  it("accepts digits only", () => {
    expect(parsePositiveInteger("25544")).toBe(25544);
  });

  it("refuses zero, signs, decimals, spaces and exponents", () => {
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("-1")).toBeNull();
    expect(parsePositiveInteger("+1")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger(" 1")).toBeNull();
    expect(parsePositiveInteger("1e3")).toBeNull();
    expect(parsePositiveInteger("")).toBeNull();
  });
});

describe("parsePositiveNumber", () => {
  it("accepts a frequency as it is typed on the bands", () => {
    expect(parsePositiveNumber("145.800")).toBe(145.8);
    expect(parsePositiveNumber("145")).toBe(145);
  });

  it("refuses what is not a plain decimal", () => {
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parsePositiveNumber("-145.8")).toBeNull();
    expect(parsePositiveNumber("145,800")).toBeNull();
    expect(parsePositiveNumber(".8")).toBeNull();
    expect(parsePositiveNumber("145.")).toBeNull();
  });
});

describe("parseIntegerInRange", () => {
  it("holds the value to the range the database also checks", () => {
    expect(parseIntegerInRange("120", 1, 86400)).toBe(120);
    expect(parseIntegerInRange("1", 1, 86400)).toBe(1);
    expect(parseIntegerInRange("86400", 1, 86400)).toBe(86400);
    expect(parseIntegerInRange("86401", 1, 86400)).toBeNull();
    expect(parseIntegerInRange("0", 1, 86400)).toBeNull();
  });
});

describe("parseNumberInRange", () => {
  it("accepts a frequency inside the range and refuses one outside", () => {
    expect(parseNumberInRange("145.800", 0, 100000)).toBe(145.8);
    expect(parseNumberInRange("100000", 0, 100000)).toBe(100000);
    expect(parseNumberInRange("100000.1", 0, 100000)).toBeNull();
  });
});

describe("parseHttpUrl", () => {
  it("accepts an http or https source", () => {
    expect(parseHttpUrl("https://www.ariss.org/")).toBe("https://www.ariss.org/");
    expect(parseHttpUrl("http://amsat.org/news")).toBe("http://amsat.org/news");
  });

  it("refuses a scheme the API must never republish as a link", () => {
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("data:text/html,hi")).toBeNull();
    expect(parseHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses what is not a URL at all", () => {
    expect(parseHttpUrl("ariss.org")).toBeNull();
    expect(parseHttpUrl("")).toBeNull();
  });
});
