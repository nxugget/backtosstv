"use client";

import { useState, useTransition, type SyntheticEvent } from "react";

import { createUserAction } from "@/app/shack/users/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import { shackInputClass, shackPrimaryButtonClass } from "@/components/shack/styles";
import { UploadPreview } from "@/components/shack/upload-preview";
import { USER_NAME_MAX_LENGTH } from "@/lib/bounds";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/shack";

export function UserForm() {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await createUserAction(state, formData));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage message={state.message} status={state.status} />

      <form key={state.resetKey} onSubmit={submit} className="flex flex-col gap-4">
        <Field htmlFor="user_name" label="Name">
          <input
            id="user_name"
            name="name"
            className={shackInputClass}
            maxLength={USER_NAME_MAX_LENGTH}
            placeholder="SSTV Tracker"
            required
          />
        </Field>

        <Field htmlFor="user_url" hint="Their official website. Optional." label="Link">
          <input
            id="user_url"
            name="url"
            className={shackInputClass}
            placeholder="https://example.com/"
            type="url"
          />
        </Field>

        <Field
          htmlFor="user_logo"
          hint="Shown next to their name on the Credits page. JPEG, PNG, WebP or GIF, up to 5 MB. Optional."
          label="Logo"
        >
          <UploadPreview
            accept="image/gif,image/jpeg,image/png,image/webp"
            currentUrl={null}
            id="user_logo"
            name="logo"
          />
        </Field>

        <button
          className={`${shackPrimaryButtonClass} self-start`}
          disabled={pending}
          type="submit"
        >
          {pending ? "Adding…" : "Add user"}
        </button>
      </form>
    </div>
  );
}
