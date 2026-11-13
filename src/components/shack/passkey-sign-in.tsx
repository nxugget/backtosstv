"use client";

import { useState } from "react";

import {
  shackAlertClass,
  shackHintClass,
  shackPrimaryButtonClass,
} from "@/components/shack/styles";
import { describePasskeyFailure } from "@/lib/passkeys";
import { SHACK_HOME_PATH } from "@/lib/shack";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function PasskeySignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPasskey();

      if (signInError !== null) {
        setError(describePasskeyFailure(signInError));
        setPending(false);

        return;
      }

      window.location.assign(SHACK_HOME_PATH);
    } catch (cause) {
      setError(describePasskeyFailure(cause));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : <p className={shackAlertClass}>{error}</p>}

      <button
        type="button"
        className={shackPrimaryButtonClass}
        disabled={pending}
        onClick={() => {
          void signIn();
        }}
      >
        {pending ? "Waiting for your device…" : "Sign in with Passkey"}
      </button>

      <p className={shackHintClass}>
        Your device will ask for Face ID, Touch ID, Windows Hello or a security key.
      </p>
    </div>
  );
}
