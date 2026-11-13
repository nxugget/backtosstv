"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { OPERATOR_NAME_MAX_LENGTH } from "@/lib/bounds";
import { isOperatorSlug, isUuid, parseHttpUrl, readText } from "@/lib/parse";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "@/lib/postgres";
import {
  IMAGE_BUCKET,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  SHACK_EVENTS_PATH,
  SHACK_HOME_PATH,
  SHACK_OPERATORS_PATH,
  storagePathFromPublicUrl,
  type FormState,
} from "@/lib/shack";
import type { DatabaseClient } from "@/lib/supabase";

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

export async function createOperatorAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();

  const details = parseDetails(formData);

  if (!details.ok) {
    return { message: details.message, resetKey, status: "error" };
  }

  const slug = readText(formData, "slug").trim().toLowerCase();

  if (!isOperatorSlug(slug)) {
    return {
      message: "The slug is lowercase letters, digits and hyphens, at least two characters.",
      resetKey,
      status: "error",
    };
  }

  const logo = await uploadLogo(supabase, formData);

  if (!logo.ok) {
    return { message: logo.message, resetKey, status: "error" };
  }

  if (logo.value === null) {
    return { message: "A logo is required.", resetKey, status: "error" };
  }

  const { error } = await supabase
    .from("operators")
    .insert({ logo_url: logo.value, name: details.value.name, slug, url: details.value.url });

  if (error !== null) {
    if (error.code === UNIQUE_VIOLATION) {
      return { message: `The slug "${slug}" is already taken.`, resetKey, status: "error" };
    }

    console.error("Failed to insert an operator", error);

    return { message: "Could not add that operator.", resetKey, status: "error" };
  }

  revalidate();

  return { message: `${details.value.name} added.`, resetKey: resetKey + 1, status: "success" };
}

/**
 * The slug is not editable. It is published by the API and may already be in somebody's code, so
 * changing it would break a link that the name and the logo can be corrected without touching.
 */
export async function updateOperatorAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    return { message: "That operator could not be found.", resetKey, status: "error" };
  }

  const details = parseDetails(formData);

  if (!details.ok) {
    return { message: details.message, resetKey, status: "error" };
  }

  const { data: before } = await supabase
    .from("operators")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();

  const logo = await uploadLogo(supabase, formData);

  if (!logo.ok) {
    return { message: logo.message, resetKey, status: "error" };
  }

  // A logo left empty keeps the one on file rather than clearing it. An operator that has no
  // logo yet cannot be saved without one.
  if (logo.value === null && (before?.logo_url ?? null) === null) {
    return { message: "A logo is required.", resetKey, status: "error" };
  }

  const { error } = await supabase
    .from("operators")
    .update({
      name: details.value.name,
      url: details.value.url,
      ...(logo.value === null ? {} : { logo_url: logo.value }),
    })
    .eq("id", id);

  if (error !== null) {
    console.error("Failed to update an operator", error);

    return { message: "Could not save that operator.", resetKey, status: "error" };
  }

  if (logo.value !== null) {
    await removeLogo(supabase, before?.logo_url ?? null);
  }

  revalidate();

  return { message: `${details.value.name} saved.`, resetKey: resetKey + 1, status: "success" };
}

export async function deleteOperatorAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    return { message: "That operator could not be found.", resetKey, status: "error" };
  }

  const { data: operator } = await supabase
    .from("operators")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("operators").delete().eq("id", id);

  if (error !== null) {
    console.error("Failed to delete an operator", error);

    return {
      message:
        error.code === FOREIGN_KEY_VIOLATION
          ? "Events still name that operator. Point them at another one first."
          : "Could not remove that operator.",
      resetKey,
      status: "error",
    };
  }

  await removeLogo(supabase, operator?.logo_url ?? null);
  revalidate();

  return { message: "Operator removed.", resetKey: resetKey + 1, status: "success" };
}

function parseDetails(formData: FormData): Outcome<{ name: string; url: string | null }> {
  const name = readText(formData, "name").trim();

  if (name === "" || name.length > OPERATOR_NAME_MAX_LENGTH) {
    return {
      message: `Enter a name, ${String(OPERATOR_NAME_MAX_LENGTH)} characters or fewer.`,
      ok: false,
    };
  }

  const rawUrl = readText(formData, "url").trim();

  if (rawUrl === "") {
    return { ok: true, value: { name, url: null } };
  }

  const url = parseHttpUrl(rawUrl);

  return url === null
    ? { message: "The link must be an http or https address.", ok: false }
    : { ok: true, value: { name, url } };
}

/**
 * Logos share the event image bucket under their own prefix: one public bucket, one set of
 * policies, and `storagePathFromPublicUrl` already refuses a URL pointing anywhere else. The stored
 * name is a fresh UUID, so whatever the file was called locally does not matter.
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

  const path = `operators/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error !== null) {
    console.error("Failed to upload an operator logo", error);

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
    console.error("Failed to remove an operator logo", error);
  }
}

/** The picker on the event screens reads this table, so both have to be refreshed. */
function revalidate(): void {
  revalidatePath(SHACK_OPERATORS_PATH);
  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);
}
