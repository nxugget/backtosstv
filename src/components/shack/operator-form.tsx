"use client";

import { useState, useTransition, type SyntheticEvent } from "react";

import { createOperatorAction } from "@/app/shack/operators/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import { shackInputClass, shackPrimaryButtonClass } from "@/components/shack/styles";
import { UploadPreview } from "@/components/shack/upload-preview";
import { OPERATOR_NAME_MAX_LENGTH, OPERATOR_SLUG_MAX_LENGTH } from "@/lib/bounds";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/shack";

export function OperatorForm() {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await createOperatorAction(state, formData));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage message={state.message} status={state.status} />

      <form key={state.resetKey} onSubmit={submit} className="flex flex-col gap-4">
        <Field htmlFor="operator_name" label="Name">
          <input
            id="operator_name"
            name="name"
            className={shackInputClass}
            maxLength={OPERATOR_NAME_MAX_LENGTH}
            placeholder="ARISS"
            required
          />
        </Field>

        <Field
          htmlFor="operator_slug"
          hint="Lowercase letters, digits and hyphens. Published by the API and used in URLs, so it does not change afterwards."
          label="Slug"
        >
          <input
            id="operator_slug"
            name="slug"
            autoCapitalize="none"
            className={shackInputClass}
            maxLength={OPERATOR_SLUG_MAX_LENGTH}
            placeholder="ariss"
            required
            spellCheck={false}
          />
        </Field>

        <Field htmlFor="operator_url" hint="Their own page. Optional." label="Link">
          <input
            id="operator_url"
            name="url"
            className={shackInputClass}
            placeholder="https://www.ariss.org/"
            type="url"
          />
        </Field>

        <Field
          htmlFor="operator_logo"
          hint="Shown next to their events. JPEG, PNG, WebP or GIF, up to 5 MB. Required."
          label="Logo"
        >
          <UploadPreview
            accept="image/gif,image/jpeg,image/png,image/webp"
            currentUrl={null}
            id="operator_logo"
            name="logo"
            required
          />
        </Field>

        <button
          className={`${shackPrimaryButtonClass} self-start`}
          disabled={pending}
          type="submit"
        >
          {pending ? "Adding…" : "Add operator"}
        </button>
      </form>
    </div>
  );
}
