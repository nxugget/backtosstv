"use client";

import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";

import { checkBootstrapEligibility } from "@/app/shack/bootstrap/actions";
import { retireAccountPassword } from "@/app/shack/passkey-actions";
import { Field } from "@/components/shack/field";
import { useReturnToPasskeySignIn } from "@/components/shack/return-to-passkey-sign-in";
import {
  shackAlertClass,
  shackInputClass,
  shackPrimaryButtonClass,
} from "@/components/shack/styles";
import { readText } from "@/lib/parse";
import { describePasskeyFailure } from "@/lib/passkeys";
import {
  SHACK_ALREADY_REGISTERED_MESSAGE,
  SHACK_ELIGIBILITY_FAILED_MESSAGE,
  SHACK_SETTINGS_PATH,
  SHACK_UNAUTHORIZED_MESSAGE,
  type BootstrapEligibility,
} from "@/lib/shack";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface BootstrapFormProps {
  email: string;
}

export function BootstrapForm({ email }: BootstrapFormProps) {
  const router = useRouter();
  const returnToPasskeySignIn = useReturnToPasskeySignIn();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = readText(formData, "email");
    const password = readText(formData, "password");

    setPending(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError !== null) {
        setError(signInError.message);
        setPending(false);

        return;
      }

      const eligibility = await checkBootstrapEligibility();

      if (eligibility !== "eligible") {
        setError(describeEligibilityFailure(eligibility));
        setPending(false);

        return;
      }

      const { error: passkeyError } = await supabase.auth.registerPasskey();

      if (passkeyError !== null) {
        setError(describePasskeyFailure(passkeyError));
        setPending(false);

        return;
      }

      const passwordRetired = await retireAccountPassword();

      if (passwordRetired) {
        await returnToPasskeySignIn();

        return;
      }

      router.push(`${SHACK_SETTINGS_PATH}?error=password-live`);
    } catch (cause) {
      setError(describePasskeyFailure(cause));
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {error === null ? null : <p className={shackAlertClass}>{error}</p>}

      <Field htmlFor="bootstrap_email" label="Email address">
        <input
          id="bootstrap_email"
          name="email"
          type="email"
          required
          autoCapitalize="none"
          autoComplete="username"
          className={shackInputClass}
          defaultValue={email}
          spellCheck={false}
        />
      </Field>

      <Field htmlFor="bootstrap_password" label="Password">
        <input
          id="bootstrap_password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={shackInputClass}
        />
      </Field>

      <button className={shackPrimaryButtonClass} disabled={pending} type="submit">
        {pending ? "Registering…" : "Sign in and register a passkey"}
      </button>
    </form>
  );
}

function describeEligibilityFailure(
  eligibility: Exclude<BootstrapEligibility, "eligible">,
): string {
  switch (eligibility) {
    case "already-registered":
      return SHACK_ALREADY_REGISTERED_MESSAGE;
    case "not-admin":
      return SHACK_UNAUTHORIZED_MESSAGE;
    default:
      return SHACK_ELIGIBILITY_FAILED_MESSAGE;
  }
}
