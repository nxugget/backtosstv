import { createSupabaseServiceRoleClient } from "@/lib/supabase";

export const CREDITS_PATH = "/credits";

export interface CreditFeeder {
  avatarUrl: string | null;
  displayName: string | null;
}

export interface CreditUser {
  id: string;
  logoUrl: string | null;
  name: string;
  url: string | null;
}

/**
 * The administrators who chose to appear on the public credits page.
 *
 * Read through `public_credit_feeders`, which holds a name and a photo and no identifier: the page
 * used to carry an administrator's `auth.users` id into the markup it serves, as a list key nobody
 * reads, and that is the same value the API refuses to publish in `created_by`. The opt-in is the
 * view's `where` rather than this caller's, so a read that forgets it cannot list somebody who
 * never agreed.
 */
export async function listCreditFeeders(): Promise<CreditFeeder[]> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("public_credit_feeders")
    .select("display_name, avatar_url");

  if (error !== null) {
    throw new Error(error.message);
  }

  return data
    .map((row) => ({ avatarUrl: row.avatar_url, displayName: row.display_name }))
    .sort((left, right) => (left.displayName ?? "").localeCompare(right.displayName ?? ""));
}

/**
 * The apps and sites that use the data, shown below the feeders. Its `id` stays: it identifies a
 * row in a table whose whole content is meant to be public, which is a different thing from
 * identifying somebody's account.
 */
export async function listCreditUsers(): Promise<CreditUser[]> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("public_credit_apps")
    .select("id, name, url, logo_url")
    .order("name", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }

  return data.map((row) => {
    // A view's columns are all nullable to the type generator, even the ones the table declares
    // `not null`. The same guard the API's mappers use: say which column is missing rather than
    // render an app with no name.
    const guaranteed = <T>(value: T | null, column: string): T => {
      if (value === null) {
        throw new Error(`An app on the credits page has no ${column}, which the database forbids.`);
      }

      return value;
    };

    return {
      id: guaranteed(row.id, "id"),
      logoUrl: row.logo_url,
      name: guaranteed(row.name, "name"),
      url: row.url,
    };
  });
}
