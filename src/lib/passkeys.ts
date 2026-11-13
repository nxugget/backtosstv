import type { PasskeyListItem } from "@supabase/supabase-js";

export interface AdminPasskey {
  createdAt: string;
  friendlyName: string | null;
  id: string;
  lastUsedAt: string | null;
}

export function toAdminPasskey(passkey: PasskeyListItem): AdminPasskey {
  return {
    createdAt: passkey.created_at,
    friendlyName: passkey.friendly_name ?? null,
    id: passkey.id,
    lastUsedAt: passkey.last_used_at ?? null,
  };
}

const PASSKEY_ERROR_MESSAGES: Record<string, string> = {
  email_not_confirmed: "Confirm this account's email address before using a passkey.",
  passkey_disabled:
    "Passkeys are switched off for this Supabase project. Enable them under Authentication, Passkeys.",
  phone_not_confirmed: "Confirm this account's phone number before using a passkey.",
  too_many_passkeys: "This account already holds the maximum number of passkeys.",
  user_banned: "This account is banned.",
  webauthn_challenge_expired: "The passkey prompt timed out. Try again.",
  webauthn_challenge_not_found: "That passkey challenge is no longer valid. Try again.",
  webauthn_credential_exists: "This device is already registered to the account.",
  webauthn_credential_not_found: "No passkey for this site is stored on this device.",
  webauthn_verification_failed: "The passkey could not be verified. Try again.",
};

/**
 * Passkey support is experimental, so failures arrive as `AuthError`, as a WebAuthn error, or as a
 * thrown DOM exception depending on where the ceremony broke. Normalise all of them for display.
 */
export function describePasskeyFailure(cause: unknown): string {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError") {
      return "The passkey prompt was dismissed or timed out.";
    }

    if (cause.name === "NotSupportedError") {
      return "This browser or device cannot use passkeys.";
    }

    return cause.message === "" ? "The passkey request failed." : cause.message;
  }

  if (cause instanceof Error) {
    const known = readErrorCode(cause);

    if (known !== null && PASSKEY_ERROR_MESSAGES[known] !== undefined) {
      return PASSKEY_ERROR_MESSAGES[known];
    }

    return cause.message === "" ? "The passkey request failed." : cause.message;
  }

  return "The passkey request failed.";
}

function readErrorCode(error: Error): string | null {
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  return null;
}
