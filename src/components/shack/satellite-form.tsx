"use client";

import { useState, useTransition, type SyntheticEvent } from "react";

import { createSatelliteAction } from "@/app/shack/satellites/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import { shackInputClass, shackPrimaryButtonClass } from "@/components/shack/styles";
import { OperatorSelect } from "@/components/shack/operator-select";
import { SATELLITE_NAME_MAX_LENGTH } from "@/lib/bounds";
import { INITIAL_FORM_STATE, type FormState, type OperatorOption } from "@/lib/shack";

export function SatelliteForm({ operators }: { operators: readonly OperatorOption[] }) {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await createSatelliteAction(state, formData));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage message={state.message} status={state.status} />

      <SatelliteFields
        key={state.resetKey}
        onSubmit={submit}
        operators={operators}
        pending={pending}
      />
    </div>
  );
}

interface SatelliteFieldsProps {
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  operators: readonly OperatorOption[];
  pending: boolean;
}

function SatelliteFields({ onSubmit, operators, pending }: SatelliteFieldsProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field htmlFor="new_satellite_name_field" label="Name">
        <input
          id="new_satellite_name_field"
          name="name"
          className={shackInputClass}
          maxLength={SATELLITE_NAME_MAX_LENGTH}
          placeholder="AO-91"
          required
        />
      </Field>

      <Field
        htmlFor="new_satellite_alternate_name"
        hint="Optional. The official name, or the older designation."
        label="Alternate name"
      >
        <input
          id="new_satellite_alternate_name"
          name="alternate_name"
          className={shackInputClass}
          maxLength={SATELLITE_NAME_MAX_LENGTH}
          placeholder="Fox-1B"
        />
      </Field>

      <Field
        htmlFor="new_satellite_norad_id_field"
        hint="Catalog number, whole digits."
        label="NORAD ID"
      >
        <input
          id="new_satellite_norad_id_field"
          name="norad_id"
          className={shackInputClass}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="25544"
          required
        />
      </Field>

      <OperatorSelect defaultValue={null} id="new_satellite_operator" operators={operators} />

      <button className={`${shackPrimaryButtonClass} self-start`} disabled={pending} type="submit">
        {pending ? "Adding…" : "Add satellite"}
      </button>
    </form>
  );
}
