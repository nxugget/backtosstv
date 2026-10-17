"use server";

import { getAdminSession, listCurrentUserPasskeys } from "@/lib/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";

/**
 * Rotates the caller's password to a random value once a passkey exists, which is what makes the
 * onboarding password one-time: the policies grant any member of `admins` full access however they
 * signed in, and GoTrue accepts that password against its REST API even though this app only offers
 * passkeys.
 *
 * Changing the password ends every session of the account, the caller's included, so a caller that
 * gets `true` must send the administrator to the login page. Refuses while no passkey exists, so an
 * account is never left with no way in.
 */
export async function retireAccountPassword(): Promise<boolean> {
  const session = await getAdminSession();

  if (session === null) {
    return false;
  }

  const passkeys = await listCurrentUserPasskeys(session.supabase);

  if (passkeys === null || passkeys.length === 0) {
    return false;
  }

  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase.auth.admin.updateUserById(session.userId, {
    password: crypto.randomUUID(),
  });

  if (error !== null) {
    console.error("Failed to retire the account password", error);

    return false;
  }

  return true;
}
