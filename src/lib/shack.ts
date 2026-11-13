import { Constants } from "@/lib/database.types";

export const SHACK_HOME_PATH = "/shack";
export const SHACK_LOGIN_PATH = "/shack/login";
export const SHACK_EVENTS_PATH = "/shack/events";
export const SHACK_SATELLITES_PATH = "/shack/satellites";
export const SHACK_OPERATORS_PATH = "/shack/operators";
export const SHACK_USERS_PATH = "/shack/users";
export const SHACK_SETTINGS_PATH = "/shack/settings";
export const SHACK_BOOTSTRAP_PATH = "/shack/bootstrap";

export const SHACK_UNAUTHORIZED_MESSAGE = "That account is not an administrator.";

export const SHACK_ALREADY_REGISTERED_MESSAGE =
  "That account already has a passkey. Sign in with it instead.";

export const SHACK_ELIGIBILITY_FAILED_MESSAGE =
  "Could not check that account's passkeys. Try again.";

export const SHACK_PASSWORD_LIVE_MESSAGE =
  "Passkey registered, but the account password is still active. Clear it in the Supabase dashboard, or it stays a working admin credential.";

export const SHACK_OWNER_ONLY_MESSAGE =
  "Only the owner can add administrators. Ask them if someone else needs access.";

export const SHACK_LOGIN_ERRORS: Record<string, string> = {
  unauthorized: SHACK_UNAUTHORIZED_MESSAGE,
};

export const SHACK_LOGIN_NOTICES: Record<string, string> = {
  registered:
    "Passkey registered. The account password is disabled and the session it opened has ended, so sign in with the passkey you just registered.",
};

export type BootstrapEligibility = "already-registered" | "eligible" | "not-admin" | "unknown";

export type SstvMode = (typeof Constants.public.Enums.sstv_mode)[number];

export const SSTV_MODES = Constants.public.Enums.sstv_mode;

export const DEFAULT_SSTV_MODE: SstvMode = "PD120";

export const IMAGE_BUCKET = "sstv-images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Object path of an image inside `IMAGE_BUCKET`, or null when the URL does not point at that bucket.
 * Only URLs of the shape `getPublicUrl` produces are accepted, so a hand-edited column value can
 * never be turned into a delete against another bucket.
 */
export function storagePathFromPublicUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }

  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  const start = url.indexOf(marker);

  if (start === -1) {
    return null;
  }

  const encoded = url.slice(start + marker.length).split(/[?#]/, 1)[0] ?? "";

  try {
    const path = decodeURIComponent(encoded);

    return path === "" || path.includes("..") ? null : path;
  } catch {
    // A malformed escape means the value did not come from getPublicUrl.
    return null;
  }
}

export interface SatelliteOption {
  alternateName: string | null;
  /** Pre-selected in the event form when this satellite is chosen; the event may still differ. */
  defaultOperatorId: string | null;
  /** The most recent past event's frequency, as typed input ("145.800"), or null when none exists. */
  lastFrequency: string | null;
  /** The most recent past event's gap between images, or null when none exists. */
  lastImageIntervalSeconds: string | null;
  /** The most recent past event's SSTV mode, or null when none exists. */
  lastMode: string | null;
  name: string;
  noradId: number;
}

export interface FormState {
  message: string | null;
  /** Advances only after a successful write, so the form clears without discarding failed input. */
  resetKey: number;
  status: "idle" | "success" | "error";
}

export const INITIAL_FORM_STATE: FormState = {
  message: null,
  resetKey: 0,
  status: "idle",
};

export interface OperatorOption {
  id: string;
  name: string;
  slug: string;
}

export interface EventFormInitial {
  endTime: string;
  eventId: string | null;
  frequency: string;
  imageIntervalSeconds: string;
  imageUrl: string | null;
  mode: string;
  noradId: number | null;
  operatorId: string | null;
  sourceUrl: string;
  startTime: string;
  title: string;
  transmitPowerWatts: string;
}

export interface AdminInvite {
  email: string;
  link: string;
  password: string;
}

export interface InviteAdminState {
  invite: AdminInvite | null;
  message: string | null;
  resetKey: number;
}

export const INITIAL_INVITE_ADMIN_STATE: InviteAdminState = {
  invite: null,
  message: null,
  resetKey: 0,
};
