"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { retireAccountPassword } from "@/app/shack/passkey-actions";
import { useReturnToPasskeySignIn } from "@/components/shack/return-to-passkey-sign-in";
import {
  shackAlertClass,
  shackDangerButtonClass,
  shackHintClass,
  shackNoticeClass,
  shackSecondaryButtonClass,
} from "@/components/shack/styles";
import { formatUtcCalendarDate } from "@/lib/format";
import { describePasskeyFailure, type AdminPasskey } from "@/lib/passkeys";
import { SHACK_PASSWORD_LIVE_MESSAGE } from "@/lib/shack";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface PasskeyManagerProps {
  passkeys: readonly AdminPasskey[] | null;
}

export function PasskeyManager({ passkeys }: PasskeyManagerProps) {
  const router = useRouter();
  const returnToPasskeySignIn = useReturnToPasskeySignIn();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const count = passkeys?.length ?? 0;

  async function register() {
    setBusy("register");
    setError(null);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: registerError } = await supabase.auth.registerPasskey();

      if (registerError !== null) {
        setError(describePasskeyFailure(registerError));

        return;
      }

      if (await retireAccountPassword()) {
        await returnToPasskeySignIn();

        return;
      }

      setError(SHACK_PASSWORD_LIVE_MESSAGE);
      router.refresh();
    } catch (cause) {
      setError(describePasskeyFailure(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove(passkeyId: string) {
    if (!window.confirm("Remove this passkey?")) {
      return;
    }

    setBusy(passkeyId);
    setError(null);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId });

      if (deleteError !== null) {
        setError(describePasskeyFailure(deleteError));

        return;
      }

      setMessage("Passkey removed.");
      router.refresh();
    } catch (cause) {
      setError(describePasskeyFailure(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error === null ? null : <p className={shackAlertClass}>{error}</p>}
      {message === null ? null : <p className={shackNoticeClass}>{message}</p>}

      {passkeys === null ? (
        <p className={shackHintClass}>
          The passkey list could not be loaded. Registering a new passkey still works.
        </p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-ink-dim">No passkeys are registered yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-edge-soft bg-void/30 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-ink">
                  {passkey.friendlyName ?? "Passkey"}
                </div>
                <div className="mt-1 text-xs text-ink-faint">
                  {`Added ${formatUtcCalendarDate(passkey.createdAt)}`}
                  {passkey.lastUsedAt === null
                    ? ""
                    : ` · last used ${formatUtcCalendarDate(passkey.lastUsedAt)}`}
                </div>
              </div>

              <button
                type="button"
                className={shackDangerButtonClass}
                disabled={busy !== null || count < 2}
                onClick={() => {
                  void remove(passkey.id);
                }}
              >
                {busy === passkey.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {count === 1 ? (
        <p className={shackHintClass}>
          A passkey cannot be removed while it is the only one, so that the account stays reachable.
        </p>
      ) : null}

      <button
        type="button"
        className={`${shackSecondaryButtonClass} self-start`}
        disabled={busy !== null}
        onClick={() => {
          void register();
        }}
      >
        {busy === "register" ? "Waiting for your device…" : "Register this device"}
      </button>
    </div>
  );
}
