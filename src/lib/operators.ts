import type { OperatorOption } from "@/lib/shack";
import type { DatabaseClient } from "@/lib/supabase";

/** The picker's choices, read through the caller's session so Row Level Security still applies. */
export async function listOperatorOptions(
  supabase: DatabaseClient,
): Promise<readonly OperatorOption[]> {
  const { data, error } = await supabase
    .from("operators")
    .select("id, slug, name")
    .order("name", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }

  return data;
}
