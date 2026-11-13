import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ERROR_CODES, ERROR_PARAMETERS, LICENSE, type ErrorCode } from "@/lib/api/http";
import { DEFAULT_LIMIT, MAX_LIMIT, STATUS_FILTERS } from "@/lib/api/query";
import { Constants } from "@/lib/database.types";

/**
 * The document is hand-written, so every value in it that also exists in the code is a chance for
 * the two to drift apart. These compare the pairs that would mislead a consumer: the published
 * enums, the page size and the licence.
 */
const document: unknown = JSON.parse(readFileSync("public/openapi.json", "utf8"));

function at(path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }

    return (node as Record<string, unknown>)[key];
  }, document);
}

interface ErrorExample {
  code: ErrorCode;
  parameter: string | null;
}

/** Every error body in the document, whether written as `example` or among `examples`. */
function errorExamples(): ErrorExample[] {
  const responses = at("components.responses");
  const found: ErrorExample[] = [];

  if (typeof responses !== "object" || responses === null) {
    return found;
  }

  const collect = (value: unknown): void => {
    const error = (value as { error?: ErrorExample } | null)?.error;

    if (error !== undefined) {
      found.push(error);
    }
  };

  for (const response of Object.values(responses)) {
    const media = (response as { content?: Record<string, Record<string, unknown>> }).content ?? {};

    for (const body of Object.values(media)) {
      collect(body.example);

      for (const example of Object.values((body.examples ?? {}) as Record<string, unknown>)) {
        collect((example as { value?: unknown }).value);
      }
    }
  }

  return found;
}

describe("openapi.json", () => {
  it("documents the status values the API accepts", () => {
    expect(at("paths./api/v1/events.get.parameters.0.schema.enum")).toEqual([...STATUS_FILTERS]);
  });

  it("documents the status default the API applies", () => {
    expect(at("paths./api/v1/events.get.parameters.0.schema.default")).toBe("upcoming");
  });

  it("documents the page size the API enforces", () => {
    expect(at("components.parameters.limit.schema.maximum")).toBe(MAX_LIMIT);
    expect(at("components.parameters.limit.schema.default")).toBe(DEFAULT_LIMIT);
  });

  it("documents every error code the API can return, and no others", () => {
    expect(at("components.schemas.Error.properties.error.properties.code.enum")).toEqual([
      ...ERROR_CODES,
    ]);
  });

  it("documents the fields every error body carries", () => {
    expect(at("components.schemas.Error.properties.error.required")).toEqual([
      "code",
      "message",
      "parameter",
      "request_id",
    ]);
  });

  // Each example is a body a client will compare its own against, so a wrong `parameter` in one is
  // a client branching on the wrong field name.
  it("names the same parameter as the code does, in every example", () => {
    const examples = errorExamples();

    expect(examples.length).toBeGreaterThan(0);

    for (const { code, parameter } of examples) {
      expect({ code, parameter }).toEqual({ code, parameter: ERROR_PARAMETERS[code] });
    }
  });

  it("documents the SSTV modes the database allows, in one place", () => {
    expect(at("components.schemas.Mode.enum")).toEqual([...Constants.public.Enums.sstv_mode]);
    // An event's mode and the `?mode=` filter both point at that one schema, so the document
    // cannot come to disagree with itself.
    expect(at("components.schemas.Event.properties.mode.$ref")).toBe("#/components/schemas/Mode");
    expect(at("components.parameters.mode.schema.$ref")).toBe("#/components/schemas/Mode");
  });

  it("documents the licence the responses carry", () => {
    expect(at("info.license.name")).toBe(LICENSE.name);
    expect(at("components.schemas.License.properties.url.examples")).toEqual([LICENSE.url]);
    expect(at("components.schemas.License.properties.attribution.examples")).toEqual([
      LICENSE.attribution,
    ]);
  });

  it("shows the minimal call first, since every parameter is optional", () => {
    // Scalar builds its own snippet out of every parameter that carries an example or a default,
    // which reads as though the endpoint required all of them. These replace it.
    const samples = at("paths./api/v1/events.get.x-codeSamples") as { source: string }[];

    expect(samples[0]?.source).toBe("curl https://backtosstv.org/api/v1/events");
    expect(samples.length).toBeGreaterThan(1);
  });

  it("hands every endpoint a sample a reader can paste", () => {
    const paths = at("paths") as Record<string, { get: Record<string, unknown> }>;

    for (const [path, item] of Object.entries(paths)) {
      expect(item.get["x-codeSamples"], `${path} has no code sample`).toBeDefined();
    }
  });

  it("describes every endpoint the API serves", () => {
    expect(Object.keys(at("paths") as Record<string, unknown>)).toEqual([
      "/api/v1",
      "/api/v1/events",
      "/api/v1/events/live",
      "/api/v1/events/upcoming",
      "/api/v1/events/past",
      "/api/v1/events/{id}",
      "/api/v1/events.ics",
      "/api/v1/deletions",
      "/api/v1/satellites",
      "/api/v1/satellites/{norad_id}",
      "/api/v1/operators",
      "/api/v1/operators/{slug}",
      "/api/v1/dump.ndjson",
      // Outside the version on purpose: a monitoring URL has to outlive `v1`. The versioned path
      // answers the same thing and is left undocumented rather than duplicated here.
      "/api/health",
    ]);
  });
});
