"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth";
import {
  MAX_EVENT_DURATION_DAYS,
  MAX_FREQUENCY_MHZ,
  MAX_IMAGE_INTERVAL_SECONDS,
  MAX_TRANSMIT_POWER_WATTS,
  SATELLITE_NAME_MAX_LENGTH,
  SOURCE_URL_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/bounds";
import { fromUtcDateTimeInput } from "@/lib/format";
import {
  isUuid,
  parseHttpUrl,
  parseIntegerInRange,
  parseNumberInRange,
  parsePositiveInteger,
  readText,
} from "@/lib/parse";
import { UNIQUE_VIOLATION } from "@/lib/postgres";
import {
  IMAGE_BUCKET,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  SHACK_EVENTS_PATH,
  SHACK_HOME_PATH,
  SSTV_MODES,
  storagePathFromPublicUrl,
  type FormState,
  type SstvMode,
} from "@/lib/shack";
import type { DatabaseClient } from "@/lib/supabase";
import sharp from "sharp";

type SatelliteChoice =
  | { kind: "existing"; noradId: number }
  | { alternateName: string | null; kind: "new"; name: string; noradId: number };

interface EventFields {
  endTime: string;
  frequency: number;
  imageIntervalSeconds: number | null;
  mode: SstvMode;
  operatorId: string;
  satellite: SatelliteChoice;
  sourceUrl: string | null;
  startTime: string;
  title: string | null;
  transmitPowerWatts: number | null;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

const DAY_IN_MS = 86_400_000;

const DUPLICATE_EVENT_MESSAGE =
  "That satellite already has an event starting at that time on that frequency.";

export async function createEventAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();

  const parsed = parseEventFields(formData);

  if (!parsed.ok) {
    return { message: parsed.message, resetKey, status: "error" };
  }

  const noradId = await resolveNoradId(supabase, parsed.value.satellite);

  if (noradId === null) {
    return { message: "Could not save the new satellite.", resetKey, status: "error" };
  }

  const image = await uploadImage(supabase, formData);

  if (!image.ok) {
    return { message: image.message, resetKey, status: "error" };
  }

  const { error } = await supabase.from("sstv_events").insert({
    title: parsed.value.title,
    end_time: parsed.value.endTime,
    frequency: parsed.value.frequency,
    image_interval_seconds: parsed.value.imageIntervalSeconds,
    image_url: image.value,
    mode: parsed.value.mode,
    norad_id: noradId,
    operator_id: parsed.value.operatorId,
    source_url: parsed.value.sourceUrl,
    start_time: parsed.value.startTime,
    transmit_power_watts: parsed.value.transmitPowerWatts,
  });

  if (error !== null) {
    if (error.code === UNIQUE_VIOLATION) {
      return { message: DUPLICATE_EVENT_MESSAGE, resetKey, status: "error" };
    }

    console.error("Failed to insert sstv_event", error);

    return { message: "Could not publish the event.", resetKey, status: "error" };
  }

  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);

  return {
    message: "Event published. Add another one below.",
    resetKey: resetKey + 1,
    status: "success",
  };
}

export async function updateEventAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    return { message: "Missing event identifier.", resetKey, status: "error" };
  }

  const parsed = parseEventFields(formData);

  if (!parsed.ok) {
    return { message: parsed.message, resetKey, status: "error" };
  }

  const noradId = await resolveNoradId(supabase, parsed.value.satellite);

  if (noradId === null) {
    return { message: "Could not save the new satellite.", resetKey, status: "error" };
  }

  const image = await uploadImage(supabase, formData);

  if (!image.ok) {
    return { message: image.message, resetKey, status: "error" };
  }

  const replacedImageUrl = image.value === null ? null : await readStoredImageUrl(supabase, id);

  const { error } = await supabase
    .from("sstv_events")
    .update({
      title: parsed.value.title,
      end_time: parsed.value.endTime,
      frequency: parsed.value.frequency,
      image_interval_seconds: parsed.value.imageIntervalSeconds,
      mode: parsed.value.mode,
      norad_id: noradId,
      operator_id: parsed.value.operatorId,
      source_url: parsed.value.sourceUrl,
      start_time: parsed.value.startTime,
      transmit_power_watts: parsed.value.transmitPowerWatts,
      ...(image.value === null ? {} : { image_url: image.value }),
    })
    .eq("id", id);

  if (error !== null) {
    if (error.code === UNIQUE_VIOLATION) {
      return { message: DUPLICATE_EVENT_MESSAGE, resetKey, status: "error" };
    }

    console.error("Failed to update sstv_event", error);

    return { message: "Could not save the event.", resetKey, status: "error" };
  }

  await removeStoredImage(supabase, replacedImageUrl);

  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);
  redirect(SHACK_EVENTS_PATH);
}

/**
 * Withdrawing an announced transmission keeps the row and sets `cancelled_at`, which is the only way
 * a client that cached the event learns it is off. Deletion is for an entry made in error, where
 * nobody can have cached anything.
 */
export async function cancelEventAction(formData: FormData): Promise<void> {
  await setCancelled(formData, true);
}

export async function restoreEventAction(formData: FormData): Promise<void> {
  await setCancelled(formData, false);
}

async function setCancelled(formData: FormData, cancelled: boolean): Promise<void> {
  const { supabase } = await requireAdminSession();
  const id = readText(formData, "id");

  if (!isUuid(id)) {
    redirect(`${SHACK_EVENTS_PATH}?error=cancel`);
  }

  const { error } = await supabase
    .from("sstv_events")
    .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq("id", id);

  if (error !== null) {
    console.error("Failed to change the cancelled state of an sstv_event", error);
    redirect(`${SHACK_EVENTS_PATH}?error=cancel`);
  }

  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);
}

function parseEventFields(formData: FormData): Outcome<EventFields> {
  const startTime = fromUtcDateTimeInput(readText(formData, "start_time"));

  if (startTime === null) {
    return { message: "Set a start time in UTC.", ok: false };
  }

  const endTime = fromUtcDateTimeInput(readText(formData, "end_time"));

  if (endTime === null) {
    return { message: "Set an end time in UTC.", ok: false };
  }

  const startedAt = Date.parse(startTime);
  const endedAt = Date.parse(endTime);

  if (endedAt <= startedAt) {
    return { message: "The end time must be after the start time.", ok: false };
  }

  if (endedAt - startedAt > MAX_EVENT_DURATION_DAYS * DAY_IN_MS) {
    return {
      // Campaigns run for days. Months is a mistyped year, and the database refuses it anyway.
      message: `An event cannot run longer than ${MAX_EVENT_DURATION_DAYS} days. Check the year.`,
      ok: false,
    };
  }

  const frequency = parseNumberInRange(readText(formData, "frequency"), 0, MAX_FREQUENCY_MHZ);

  if (frequency === null) {
    return { message: "Enter a frequency in MHz, such as 145.800.", ok: false };
  }

  const mode = parseMode(readText(formData, "mode"));

  if (mode === null) {
    return { message: "Choose an SSTV mode.", ok: false };
  }

  const satellite = parseSatellite(formData);

  if (satellite === null) {
    return {
      message: "Choose a satellite, or enter a NORAD ID and name for a new one.",
      ok: false,
    };
  }

  const operatorId = readText(formData, "operator_id");

  if (!isUuid(operatorId)) {
    return { message: "Choose the operator running this transmission.", ok: false };
  }

  const rawPower = readText(formData, "transmit_power_watts");
  let transmitPowerWatts: number | null = null;

  if (rawPower !== "") {
    transmitPowerWatts = parseNumberInRange(rawPower, 0, MAX_TRANSMIT_POWER_WATTS);

    if (transmitPowerWatts === null) {
      return {
        message: `Enter the transmitter power in watts, up to ${String(MAX_TRANSMIT_POWER_WATTS)}.`,
        ok: false,
      };
    }
  }

  const rawInterval = readText(formData, "image_interval_seconds");
  let imageIntervalSeconds: number | null = null;

  if (rawInterval !== "") {
    imageIntervalSeconds = parseIntegerInRange(rawInterval, 1, MAX_IMAGE_INTERVAL_SECONDS);

    if (imageIntervalSeconds === null) {
      return {
        message: `The image interval must be a whole number of seconds, up to ${MAX_IMAGE_INTERVAL_SECONDS}.`,
        ok: false,
      };
    }
  }

  const title = readText(formData, "title");

  if (title.length > TITLE_MAX_LENGTH) {
    return {
      message: `The title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
      ok: false,
    };
  }

  const rawSourceUrl = readText(formData, "source_url");
  let sourceUrl: string | null = null;

  if (rawSourceUrl !== "") {
    if (rawSourceUrl.length > SOURCE_URL_MAX_LENGTH) {
      return { message: "That source link is too long.", ok: false };
    }

    sourceUrl = parseHttpUrl(rawSourceUrl);

    if (sourceUrl === null) {
      return { message: "The source must be an http or https link.", ok: false };
    }
  }

  return {
    ok: true,
    value: {
      endTime,
      frequency,
      imageIntervalSeconds,
      mode,
      operatorId,
      satellite,
      sourceUrl,
      startTime,
      title: title === "" ? null : title,
      transmitPowerWatts,
    },
  };
}

function parseSatellite(formData: FormData): SatelliteChoice | null {
  if (readText(formData, "satellite_mode") === "new") {
    const noradId = parsePositiveInteger(readText(formData, "new_satellite_norad_id"));
    const name = readText(formData, "new_satellite_name");
    const alternateName = readText(formData, "new_satellite_alternate_name");

    if (
      noradId === null ||
      name === "" ||
      name.length > SATELLITE_NAME_MAX_LENGTH ||
      alternateName.length > SATELLITE_NAME_MAX_LENGTH
    ) {
      return null;
    }

    return {
      alternateName: alternateName === "" ? null : alternateName,
      kind: "new",
      name,
      noradId,
    };
  }

  const noradId = parsePositiveInteger(readText(formData, "norad_id"));

  return noradId === null ? null : { kind: "existing", noradId };
}

async function resolveNoradId(
  supabase: DatabaseClient,
  choice: SatelliteChoice,
): Promise<number | null> {
  if (choice.kind === "existing") {
    return choice.noradId;
  }

  const { error } = await supabase.from("satellites").insert({
    alternate_name: choice.alternateName,
    name: choice.name,
    norad_id: choice.noradId,
  });

  if (error !== null && error.code !== UNIQUE_VIOLATION) {
    console.error("Failed to insert satellite", error);

    return null;
  }

  return choice.noradId;
}

async function uploadImage(
  supabase: DatabaseClient,
  formData: FormData,
): Promise<Outcome<string | null>> {
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, value: null };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { message: "That image is larger than 5 MB.", ok: false };
  }

  const extension = IMAGE_EXTENSIONS[file.type];

  if (extension === undefined) {
    return { message: "Upload a JPEG, PNG, WebP or GIF image.", ok: false };
  }

  const standardized = await standardizeImage(file);

  if (!standardized.ok) {
    return { message: standardized.message, ok: false };
  }

  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, standardized.value, { contentType: "image/jpeg", upsert: false });

  if (error !== null) {
    console.error("Failed to upload event image", error);

    return { message: "Could not upload the image.", ok: false };
  }

  return { ok: true, value: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

/**
 * Every event image is shrunk to fit inside a 1280x720 frame and re-encoded as JPEG before it
 * reaches the bucket. The whole image is kept: its aspect ratio is preserved, so nothing is
 * cropped off the sides, top, or bottom.
 */
async function standardizeImage(file: File): Promise<Outcome<Buffer>> {
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const buffer = await sharp(bytes)
      .rotate()
      .resize(1280, 720, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return { ok: true, value: buffer };
  } catch (cause) {
    console.error("Failed to standardize the event image", cause);

    return { message: "Could not process that image.", ok: false };
  }
}

async function readStoredImageUrl(supabase: DatabaseClient, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sstv_events")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();

  if (error !== null) {
    console.error("Failed to read the event image", error);

    return null;
  }

  return data === null ? null : data.image_url;
}

/**
 * Best effort: the row is the source of truth, so a failure here leaves an unused object behind
 * rather than failing an edit or a delete that already succeeded.
 */
async function removeStoredImage(supabase: DatabaseClient, url: string | null): Promise<void> {
  const path = storagePathFromPublicUrl(url);

  if (path === null) {
    return;
  }

  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);

  if (error !== null) {
    console.error("Failed to remove the event image", error);
  }
}

function parseMode(value: string): SstvMode | null {
  return SSTV_MODES.find((mode) => mode === value) ?? null;
}
