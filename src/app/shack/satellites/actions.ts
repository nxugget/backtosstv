"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { SATELLITE_NAME_MAX_LENGTH } from "@/lib/bounds";
import { isUuid, parsePositiveInteger, readText } from "@/lib/parse";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "@/lib/postgres";
import {
  SHACK_EVENTS_PATH,
  SHACK_HOME_PATH,
  SHACK_SATELLITES_PATH,
  type FormState,
} from "@/lib/shack";

interface SatelliteFields {
  alternateName: string | null;
  /** Null when this satellite has no usual operator, or when the one chosen is not a known id. */
  defaultOperatorId: string | null;
  name: string;
  noradId: number;
}

type Outcome = { ok: true; value: SatelliteFields } | { ok: false; message: string };

export async function createSatelliteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const parsed = parseSatelliteFields(formData);

  if (!parsed.ok) {
    return { message: parsed.message, resetKey, status: "error" };
  }

  const { error } = await supabase.from("satellites").insert({
    alternate_name: parsed.value.alternateName,
    default_operator_id: parsed.value.defaultOperatorId,
    name: parsed.value.name,
    norad_id: parsed.value.noradId,
  });

  if (error !== null) {
    return { message: describeWriteFailure(error), resetKey, status: "error" };
  }

  revalidateSatelliteConsumers();

  return {
    message: `${parsed.value.name} added.`,
    resetKey: resetKey + 1,
    status: "success",
  };
}

/**
 * The NORAD ID doubles as the primary key and as the target of `sstv_events.norad_id`, so renaming
 * one that events already point at is left to the database to refuse rather than guessed at here.
 */
export async function updateSatelliteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const originalNoradId = parsePositiveInteger(readText(formData, "original_norad_id"));
  const parsed = parseSatelliteFields(formData);

  if (originalNoradId === null) {
    return { message: "Missing satellite identifier.", resetKey, status: "error" };
  }

  if (!parsed.ok) {
    return { message: parsed.message, resetKey, status: "error" };
  }

  const { error } = await supabase
    .from("satellites")
    .update({
      alternate_name: parsed.value.alternateName,
      default_operator_id: parsed.value.defaultOperatorId,
      name: parsed.value.name,
      norad_id: parsed.value.noradId,
    })
    .eq("norad_id", originalNoradId);

  if (error !== null) {
    return {
      message:
        error.code === FOREIGN_KEY_VIOLATION
          ? "That NORAD ID is used by existing events, so it cannot change."
          : describeWriteFailure(error),
      resetKey,
      status: "error",
    };
  }

  revalidateSatelliteConsumers();

  return { message: `${parsed.value.name} saved.`, resetKey: resetKey + 1, status: "success" };
}

/**
 * Only for a satellite added by mistake: the NORAD number is the target of `sstv_events.norad_id`,
 * so the database refuses to remove one an event points at, and that refusal is reported as is
 * rather than guessed at here.
 */
export async function deleteSatelliteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resetKey = previous.resetKey;
  const { supabase } = await requireAdminSession();
  const noradId = parsePositiveInteger(readText(formData, "norad_id"));

  if (noradId === null) {
    return { message: "Missing satellite identifier.", resetKey, status: "error" };
  }

  const { error } = await supabase.from("satellites").delete().eq("norad_id", noradId);

  if (error !== null) {
    return {
      message:
        error.code === FOREIGN_KEY_VIOLATION
          ? "That satellite has events, so it cannot be removed. Delete those first."
          : describeWriteFailure(error),
      resetKey,
      status: "error",
    };
  }

  revalidateSatelliteConsumers();

  return { message: "Satellite removed.", resetKey: resetKey + 1, status: "success" };
}

function revalidateSatelliteConsumers(): void {
  revalidatePath(SHACK_SATELLITES_PATH);
  revalidatePath(SHACK_HOME_PATH);
  revalidatePath(SHACK_EVENTS_PATH);
}

function describeWriteFailure(error: { code: string; message: string }): string {
  if (error.code === UNIQUE_VIOLATION) {
    return "A satellite with that NORAD ID is already listed.";
  }

  console.error("Failed to write a satellite", error);

  return "Could not save the satellite.";
}

function parseSatelliteFields(formData: FormData): Outcome {
  const noradId = parsePositiveInteger(readText(formData, "norad_id"));

  if (noradId === null) {
    return { message: "Enter the NORAD ID as a whole number, such as 25544.", ok: false };
  }

  const name = readText(formData, "name");

  if (name === "") {
    return { message: "Enter a satellite name.", ok: false };
  }

  if (name.length > SATELLITE_NAME_MAX_LENGTH) {
    return {
      message: `The name must be ${SATELLITE_NAME_MAX_LENGTH} characters or fewer.`,
      ok: false,
    };
  }

  const alternateName = readText(formData, "alternate_name");

  if (alternateName.length > SATELLITE_NAME_MAX_LENGTH) {
    return {
      message: `The alternate name must be ${SATELLITE_NAME_MAX_LENGTH} characters or fewer.`,
      ok: false,
    };
  }

  // An empty choice means "no usual operator", which is the honest answer for a satellite that
  // several organisations transmit from.
  const chosenOperator = readText(formData, "default_operator_id");

  return {
    ok: true,
    value: {
      alternateName: alternateName === "" ? null : alternateName,
      defaultOperatorId: isUuid(chosenOperator) ? chosenOperator : null,
      name,
      noradId,
    },
  };
}
