import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Guards the one-time bootstrap screen with an out-of-band secret. An unset or empty
 * `BOOTSTRAP_TOKEN` never matches, so deleting the variable makes the route inert.
 */
export function isBootstrapTokenValid(provided: string | null): boolean {
  const expected = process.env.BOOTSTRAP_TOKEN;

  if (provided === null || expected === undefined || expected === "") {
    return false;
  }

  // Hashing first keeps both operands the same length, which timingSafeEqual requires.
  return timingSafeEqual(sha256(provided), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
