"use client";

import { useRouter } from "next/navigation";

import { SHACK_LOGIN_PATH } from "@/lib/shack";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * Sends the administrator back to the passkey prompt after `retireAccountPassword`. Rotating the
 * password made GoTrue drop every session, and the browser client is a module singleton that would
 * otherwise keep presenting the dead one.
 */
export function useReturnToPasskeySignIn(): () => Promise<void> {
  const router = useRouter();

  return async function returnToPasskeySignIn(): Promise<void> {
    await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
    router.push(`${SHACK_LOGIN_PATH}?notice=registered`);
  };
}
