"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdminSession, requireOwnerSession } from "@/lib/auth";
import { ADMIN_NAME_MAX_LENGTH } from "@/lib/bounds";
import { CREDITS_PATH } from "@/lib/credits";
import { readText } from "@/lib/parse";
import {
  IMAGE_BUCKET,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  SHACK_BOOTSTRAP_PATH,
  SHACK_EVENTS_PATH,
  SHACK_HOME_PATH,
  SHACK_SETTINGS_PATH,
  storagePathFromPublicUrl,
  type InviteAdminState,
} from "@/lib/shack";
import { configuredSiteOrigin } from "@/lib/site";
import { createSupabaseServiceRoleClient, type DatabaseClient } from "@/lib/supabase";

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * The name and photo the other administrators see next to what you publish. Written with the secret
 * key because `admins` refuses writes from any authenticated session, the same reason the invite
 * below does, so the session check here is the whole authorisation.
 */
export async function saveAdminProfileAction(formData: FormData): Promise<void> {
  const { userId } = await requireAdminSession();
  const name = readText(formData, "display_name").trim();

  if (name.length > ADMIN_NAME_MAX_LENGTH) {
    redirect(`${SHACK_SETTINGS_PATH}?error=name-too-long`);
  }

  const supabase = createSupabaseServiceRoleClient();
  const avatar = await uploadAvatar(supabase, formData);

  if (!avatar.ok) {
    redirect(`${SHACK_SETTINGS_PATH}?error=avatar-failed`);
  }

  const shownOnCredits = formData.has("shown_on_credits");

  const { data: before } = await supabase
    .from("admins")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("admins")
    .update({
      display_name: name === "" ? null : name,
      shown_on_credits: shownOnCredits,
      // A photo left empty keeps the one on file rather than clearing it.
      ...(avatar.value === null ? {} : { avatar_url: avatar.value }),
    })
    .eq("user_id", userId);

  if (error !== null) {
    console.error("Failed to set an administrator's profile", error);
    redirect(`${SHACK_SETTINGS_PATH}?error=profile-failed`);
  }

  if (avatar.value !== null) {
    await removeAvatar(supabase, before?.avatar_url ?? null);
  }

  revalidatePath(SHACK_SETTINGS_PATH);
  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);
  revalidatePath(CREDITS_PATH);
  redirect(SHACK_SETTINGS_PATH);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_GROUP_LENGTH = 5;
const PASSWORD_GROUP_COUNT = 4;

export async function inviteAdminAction(
  previous: InviteAdminState,
  formData: FormData,
): Promise<InviteAdminState> {
  const resetKey = previous.resetKey;

  await requireOwnerSession();

  const email = readText(formData, "email").toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { invite: null, message: "Enter a valid email address.", resetKey };
  }

  const name = readText(formData, "display_name").trim();

  if (name === "" || name.length > ADMIN_NAME_MAX_LENGTH) {
    return {
      invite: null,
      message: `Give them a name, ${String(ADMIN_NAME_MAX_LENGTH)} characters or fewer. It is what the admin screens will show next to what they publish.`,
      resetKey,
    };
  }

  const token = process.env.BOOTSTRAP_TOKEN;

  if (token === undefined || token === "") {
    return {
      invite: null,
      message: "BOOTSTRAP_TOKEN is not set, so a bootstrap link cannot be built.",
      resetKey,
    };
  }

  const supabase = createSupabaseServiceRoleClient();
  const password = createTemporaryPassword();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (createError !== null) {
    console.error("Failed to create the invited user", createError);

    return {
      invite: null,
      message:
        createError.code === "email_exists"
          ? "That email already has an account. Add their user id to the admins table instead."
          : "Could not create that account. Try again.",
      resetKey,
    };
  }

  const { error: grantError } = await supabase
    .from("admins")
    .insert({ display_name: name, user_id: created.user.id });

  if (grantError !== null) {
    console.error("Failed to grant admin access to the invited user", grantError);

    const { error: rollbackError } = await supabase.auth.admin.deleteUser(created.user.id);

    if (rollbackError !== null) {
      console.error("Failed to roll back the invited user", rollbackError);
    }

    return { invite: null, message: "Could not grant admin access. Try again.", resetKey };
  }

  const origin = await getInviteOrigin();
  const link = `${origin}${SHACK_BOOTSTRAP_PATH}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return { invite: { email, link, password }, message: null, resetKey: resetKey + 1 };
}

/**
 * Four groups of five characters from an alphabet without look-alikes, so the password survives
 * being read out over the phone.
 */
function createTemporaryPassword(): string {
  const groups: string[] = [];

  for (let group = 0; group < PASSWORD_GROUP_COUNT; group += 1) {
    let characters = "";

    for (let index = 0; index < PASSWORD_GROUP_LENGTH; index += 1) {
      characters += PASSWORD_ALPHABET.charAt(randomInt(PASSWORD_ALPHABET.length));
    }

    groups.push(characters);
  }

  return groups.join("-");
}

/**
 * The invite link carries `BOOTSTRAP_TOKEN`, so its host cannot come from a request header: a forged
 * `Host` would aim the token at another domain. `SITE_URL` first, then Vercel's own hostname, and
 * the header only on a local server where neither exists.
 */
async function getInviteOrigin(): Promise<string> {
  const configured = configuredSiteOrigin();

  if (configured !== null) {
    return configured;
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (vercelHost !== undefined && vercelHost !== "") {
    return `https://${vercelHost}`;
  }

  const headerList = await headers();
  const host = headerList.get("host");

  if (host === null) {
    throw new Error("Set SITE_URL so the bootstrap link can be built.");
  }

  return `http://${host}`;
}

/**
 * Profile photos share the event image bucket under their own prefix, exactly like operator logos:
 * one public bucket, one set of policies, and `storagePathFromPublicUrl` already refuses a URL
 * pointing anywhere else. The stored name is a fresh UUID, so the file's local name never matters.
 */
async function uploadAvatar(
  supabase: DatabaseClient,
  formData: FormData,
): Promise<Outcome<string | null>> {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, value: null };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { message: "That photo is larger than 5 MB.", ok: false };
  }

  const extension = IMAGE_EXTENSIONS[file.type];

  if (extension === undefined) {
    return { message: "Upload a JPEG, PNG, WebP or GIF image.", ok: false };
  }

  const path = `avatars/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error !== null) {
    console.error("Failed to upload an admin avatar", error);

    return { message: "Could not upload the photo.", ok: false };
  }

  return { ok: true, value: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

async function removeAvatar(supabase: DatabaseClient, url: string | null): Promise<void> {
  const path = storagePathFromPublicUrl(url);

  if (path === null) {
    return;
  }

  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);

  if (error !== null) {
    console.error("Failed to remove an admin avatar", error);
  }
}
