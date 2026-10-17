import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { requireEnv } from "@/lib/env";

type DatabaseClient = SupabaseClient<Database>;

export type { DatabaseClient };

let serviceRoleClient: DatabaseClient | undefined;

/**
 * Request-scoped client bound to the caller's cookies. Use this from Route Handlers and Server
 * Components so that Row Level Security applies to the requesting user.
 */
export async function createSupabaseServerClient(): Promise<DatabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { experimental: { passkey: true } },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

/**
 * Privileged client that bypasses Row Level Security. Route Handlers and Server Actions only, never
 * the browser.
 *
 * The public API reads through this, since `anon` holds no privileges on the catalogue tables. The
 * caller therefore decides what is published, so every public read goes through
 * `@/lib/api/catalogue` and its fixed column lists, and nothing else.
 */
export function createSupabaseServiceRoleClient(): DatabaseClient {
  serviceRoleClient ??= createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        experimental: { passkey: true },
        persistSession: false,
      },
    },
  );

  return serviceRoleClient;
}
