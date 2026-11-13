/**
 * Reading untrusted input: form fields in the admin, path and query parameters in the API. Nothing
 * here touches the database or the request, so every rule it encodes is testable on its own.
 */

import { OPERATOR_SLUG_MAX_LENGTH, OPERATOR_SLUG_MIN_LENGTH } from "@/lib/bounds";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A missing field and a field holding a file both read as empty, which is what callers check for. */
export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * The shape `operators_slug_shape` enforces: lowercase letters, digits and single hyphens. One
 * definition, because the admin form deciding one thing and the API another is how a slug the
 * database accepts becomes a slug the API answers 400 for.
 */
export function isOperatorSlug(value: string): boolean {
  return (
    SLUG_PATTERN.test(value) &&
    value.length >= OPERATOR_SLUG_MIN_LENGTH &&
    value.length <= OPERATOR_SLUG_MAX_LENGTH
  );
}

/** Digits only: a leading `+`, a sign or an exponent is a mistake, not a number to be salvaged. */
export function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed > 0 ? parsed : null;
}

export function parsePositiveNumber(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed > 0 ? parsed : null;
}

/**
 * An http(s) URL, or null. A source that cannot be opened is not a source, and this is also what
 * keeps a `javascript:` or `data:` value out of a field the public API republishes.
 */
export function parseHttpUrl(value: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
}

/** Parses, then holds the value to a range the database also enforces. */
export function parseIntegerInRange(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = parsePositiveInteger(value);

  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function parseNumberInRange(value: string, minimum: number, maximum: number): number | null {
  const parsed = parsePositiveNumber(value);

  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}
