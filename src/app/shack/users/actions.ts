"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { USER_NAME_MAX_LENGTH } from "@/lib/bounds";
import { CREDITS_PATH } from "@/lib/credits";
import { isUuid, parseHttpUrl, readText } from "@/lib/parse";
import {
  IMAGE_BUCKET,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  SHACK_USERS_PATH,
  storagePathFromPublicUrl,
  type FormState,
} from "@/lib/shack";
import type { DatabaseClient } from "@/lib/supabase";

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

export async function createUserAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();

  const details = parseDetails(formData);

  if (!details.ok) {
    return { message: details.message, resetKey, status: "error" };
  }

  const logo = await uploadLogo(supabase, formData);

  if (!logo.ok) {
    return { message: logo.message, resetKey, status: "error" };
  }

  const { error } = await supabase
    .from("app_users")
    .insert({ logo_url: logo.value, name: details.value.name, url: details.value.url });

  if (error !== null) {
    console.error("Failed to insert an app user", error);

    return { message: "Could not add that user.", resetKey, status: "error" };
  }

  revalidate();

  return { message: `${details.value.name} added.`, resetKey: resetKey + 1, status: "success" };
}

export async function updateUserAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    return { message: "That user could not be found.", resetKey, status: "error" };
  }

  const details = parseDetails(formData);

  if (!details.ok) {
    return { message: details.message, resetKey, status: "error" };
  }

  const logo = await uploadLogo(supabase, formData);

  if (!logo.ok) {
    return { message: logo.message, resetKey, status: "error" };
  }

  const { data: before } = await supabase
    .from("app_users")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("app_users")
    .update({
      name: details.value.name,
      url: details.value.url,
      // A logo left empty keeps the one on file rather than clearing it.
      ...(logo.value === null ? {} : { logo_url: logo.value }),
    })
    .eq("id", id);

  if (error !== null) {
    console.error("Failed to update an app user", error);

    return { message: "Could not save that user.", resetKey, status: "error" };
  }

  if (logo.value !== null) {
    await removeLogo(supabase, before?.logo_url ?? null);
  }

  revalidate();

  return { message: `${details.value.name} saved.`, resetKey: resetKey + 1, status: "success" };
}

export async function deleteUserAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    return { message: "That user could not be found.", resetKey, status: "error" };
  }

  const { data: user } = await supabase
    .from("app_users")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("app_users").delete().eq("id", id);

  if (error !== null) {
    console.error("Failed to delete an app user", error);

    return { message: "Could not remove that user.", resetKey, status: "error" };
  }

  await removeLogo(supabase, user?.logo_url ?? null);
  revalidate();

  return { message: "User removed.", resetKey: resetKey + 1, status: "success" };
}

function parseDetails(formData: FormData): Outcome<{ name: string; url: string | null }> {
  const name = readText(formData, "name").trim();

  if (name === "" || name.length > USER_NAME_MAX_LENGTH) {
    return {
      message: `Enter a name, ${String(USER_NAME_MAX_LENGTH)} characters or fewer.`,
      ok: false,
    };
  }

  const rawUrl = readText(formData, "url").trim();

  if (rawUrl === "") {
    return { ok: true, value: { name, url: null } };
  }

  const url = parseHttpUrl(rawUrl);

  return url === null
    ? { message: "The official website must be an http or https address.", ok: false }
    : { ok: true, value: { name, url } };
}

/**
 * Logos share the event image bucket under their own prefix, exactly like operator logos and admin
 * avatars. The stored name is a fresh UUID, so whatever the file was called locally does not matter.
 */
async function uploadLogo(
  supabase: DatabaseClient,
  formData: FormData,
): Promise<Outcome<string | null>> {
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, value: null };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { message: "That logo is larger than 5 MB.", ok: false };
  }

  const extension = IMAGE_EXTENSIONS[file.type];

  if (extension === undefined) {
    return { message: "Upload a JPEG, PNG, WebP or GIF image.", ok: false };
  }

  const path = `users/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error !== null) {
    console.error("Failed to upload an app user logo", error);

    return { message: "Could not upload the logo.", ok: false };
  }

  return { ok: true, value: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

async function removeLogo(supabase: DatabaseClient, url: string | null): Promise<void> {
  const path = storagePathFromPublicUrl(url);

  if (path === null) {
    return;
  }

  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);

  if (error !== null) {
    console.error("Failed to remove an app user logo", error);
  }
}

/** The public credits page reads this table, so it has to be refreshed too. */
function revalidate(): void {
  revalidatePath(SHACK_USERS_PATH);
  revalidatePath(CREDITS_PATH);
}
