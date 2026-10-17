"use client";

import { useState, useTransition, type SyntheticEvent } from "react";

import { inviteAdminAction } from "@/app/shack/settings/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import {
  shackHintClass,
  shackInputClass,
  shackLabelClass,
  shackSecondaryButtonClass,
} from "@/components/shack/styles";
import { ADMIN_NAME_MAX_LENGTH } from "@/lib/bounds";
import { INITIAL_INVITE_ADMIN_STATE, type AdminInvite, type InviteAdminState } from "@/lib/shack";

export function InviteAdminPanel() {
  const [state, setState] = useState<InviteAdminState>(INITIAL_INVITE_ADMIN_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await inviteAdminAction(state, formData));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage message={state.message} status="error" />
      {state.invite === null ? null : <InviteResult invite={state.invite} />}

      <form key={state.resetKey} onSubmit={submit} className="flex flex-col gap-4">
        <Field
          htmlFor="invite_name"
          hint="What the admin screens will show next to what they publish."
          label="Their name"
        >
          <input
            id="invite_name"
            name="display_name"
            type="text"
            required
            autoComplete="off"
            className={shackInputClass}
            maxLength={ADMIN_NAME_MAX_LENGTH}
          />
        </Field>

        <Field
          htmlFor="invite_email"
          hint="They must not already have a Supabase account."
          label="New administrator email"
        >
          <input
            id="invite_email"
            name="email"
            type="email"
            required
            autoCapitalize="none"
            autoComplete="off"
            className={shackInputClass}
            spellCheck={false}
          />
        </Field>

        <button
          className={`${shackSecondaryButtonClass} self-start`}
          disabled={pending}
          type="submit"
        >
          {pending ? "Creating…" : "Create invite"}
        </button>
      </form>
    </div>
  );
}

function InviteResult({ invite }: { invite: AdminInvite }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-signal/40 bg-signal/10 p-4">
      <p className="text-sm leading-relaxed text-ink">
        Invite for <span className="font-mono">{invite.email}</span> is ready. Both values are shown
        once and cannot be retrieved again.
      </p>

      <CopyField label="Bootstrap link" value={invite.link} />
      <CopyField label="Temporary password" value={invite.password} />

      <p className={shackHintClass}>
        Pass both on out of band: in person or over a call, not email. They open the link, sign in
        with the password and register a passkey. After that the password stops working.
      </p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (cause) {
      console.error("Failed to copy to the clipboard", cause);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={shackLabelClass}>{label}</span>

      <div className="flex gap-2">
        <input className={shackInputClass} readOnly value={value} />
        <button
          type="button"
          className={shackSecondaryButtonClass}
          onClick={() => {
            void copy();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
