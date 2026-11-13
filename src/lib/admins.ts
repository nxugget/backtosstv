import { createSupabaseServiceRoleClient } from "@/lib/supabase";

/**
 * Who the administrators are, for the admin screens only.
 *
 * Email addresses live in `auth.users`, which PostgREST does not expose, so this reads them with
 * the Admin API and joins them to `public.admins` here. That keeps the lookup server-side: nothing
 * is granted to `authenticated`, and no curator's identity reaches the public API.
 */

export interface Administrator {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  isOwner: boolean;
  shownOnCredits: boolean;
  userId: string;
}

/** A person an admin screen can attribute an event to, with their photo when they have chosen one. */
export interface WriterProfile {
  avatarUrl: string | null;
  name: string;
}

/** Enough for any team this project will have; the Admin API pages beyond it. */
const MAX_ACCOUNTS = 200;

export async function listAdministrators(): Promise<Administrator[]> {
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: rows, error }, { data: accounts, error: accountsError }] = await Promise.all([
    supabase.from("admins").select("user_id, is_owner, display_name, avatar_url, shown_on_credits"),
    supabase.auth.admin.listUsers({ page: 1, perPage: MAX_ACCOUNTS }),
  ]);

  if (error !== null) {
    throw new Error(error.message);
  }

  if (accountsError !== null) {
    throw new Error(accountsError.message);
  }

  const emails = new Map(accounts.users.map((user) => [user.id, user.email ?? null]));

  return rows
    .map((row) => ({
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      email: emails.get(row.user_id) ?? null,
      isOwner: row.is_owner,
      shownOnCredits: row.shown_on_credits,
      userId: row.user_id,
    }))
    .sort(byOwnerThenName);
}

/**
 * What to call each administrator, keyed by user id, and the photo to put beside the name. An email
 * address is a way to reach somebody, not a way to refer to them: "Edited by alice@example.com" is
 * both ugly and more of that person's address than the other curators need to read all day.
 */
export async function writerProfiles(): Promise<Map<string, WriterProfile>> {
  const { data: rows, error } = await createSupabaseServiceRoleClient()
    .from("admins")
    .select("user_id, display_name, avatar_url");

  if (error !== null) {
    throw new Error(error.message);
  }

  return new Map(
    rows
      .filter((row): row is typeof row & { display_name: string } => row.display_name !== null)
      .map((row) => [row.user_id, { avatarUrl: row.avatar_url, name: row.display_name }]),
  );
}

/**
 * Null for a row nobody is recorded against, which is what the columns held before the trigger
 * existed. An administrator who has not set a name yet is named as one rather than by their
 * address; the settings screen asks them for it.
 */
export function writerFor(
  profiles: Map<string, WriterProfile>,
  userId: string | null,
): WriterProfile | null {
  if (userId === null) {
    return null;
  }

  return profiles.get(userId) ?? { avatarUrl: null, name: "an administrator" };
}

function byOwnerThenName(left: Administrator, right: Administrator): number {
  if (left.isOwner !== right.isOwner) {
    return left.isOwner ? -1 : 1;
  }

  return (left.displayName ?? left.email ?? "").localeCompare(
    right.displayName ?? right.email ?? "",
  );
}
