import { redirect } from "next/navigation";

import { toAdminPasskey, type AdminPasskey } from "@/lib/passkeys";
import { SHACK_LOGIN_PATH, SHACK_SETTINGS_PATH, type BootstrapEligibility } from "@/lib/shack";
import { createSupabaseServerClient, type DatabaseClient } from "@/lib/supabase";

interface AdminSession {
  email: string | null;
  isOwner: boolean;
  supabase: DatabaseClient;
  userId: string;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getUser();

  if (error !== null) {
    return null;
  }

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("user_id, is_owner")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError !== null || admin === null) {
    return null;
  }

  return {
    email: data.user.email ?? null,
    isOwner: admin.is_owner,
    supabase,
    userId: data.user.id,
  };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (session === null) {
    redirect(SHACK_LOGIN_PATH);
  }

  return session;
}

/**
 * An `admins` row is the whole access model, so handing one out is reserved to the owner. The
 * database refuses direct writes to that table from any authenticated session, which leaves the
 * invite action as the only way in.
 */
export async function requireOwnerSession(): Promise<AdminSession> {
  const session = await requireAdminSession();

  if (!session.isOwner) {
    redirect(`${SHACK_SETTINGS_PATH}?error=owner-only`);
  }

  return session;
}

export async function getSignedInEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getUser();

  if (error !== null) {
    return null;
  }

  return data.user.email ?? null;
}

export async function listCurrentUserPasskeys(
  supabase: DatabaseClient,
): Promise<AdminPasskey[] | null> {
  const { data, error } = await supabase.auth.passkey.list();

  if (error !== null) {
    console.error("Failed to list passkeys", error);

    return null;
  }

  return data.map((passkey) => toAdminPasskey(passkey));
}

/**
 * Whether the caller may run the bootstrap flow: signed in, listed in `admins`, and not yet holding
 * a passkey. Other administrators having passkeys is irrelevant, which is what lets new ones enrol.
 */
export async function getBootstrapEligibility(): Promise<BootstrapEligibility> {
  const session = await getAdminSession();

  if (session === null) {
    return "not-admin";
  }

  const passkeys = await listCurrentUserPasskeys(session.supabase);

  if (passkeys === null) {
    return "unknown";
  }

  return passkeys.length > 0 ? "already-registered" : "eligible";
}
