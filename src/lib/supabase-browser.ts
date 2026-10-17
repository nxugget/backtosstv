import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requirePublicEnv } from "@/lib/env";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Browser-side client, used only for the WebAuthn ceremonies, which cannot run on the server. It
 * stores the session in cookies so the server components and the proxy can read it.
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  browserClient ??= createBrowserClient<Database>(
    requirePublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
    { auth: { experimental: { passkey: true } } },
  );

  return browserClient;
}
