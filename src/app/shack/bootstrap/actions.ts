"use server";

import { getBootstrapEligibility } from "@/lib/auth";
import type { BootstrapEligibility } from "@/lib/shack";

/**
 * Called between the bootstrap sign-in and the passkey prompt, so that a signed-in non-admin or an
 * already-enrolled account never reaches a WebAuthn ceremony.
 */
export async function checkBootstrapEligibility(): Promise<BootstrapEligibility> {
  return getBootstrapEligibility();
}
