"use client";

import { useState, useTransition, type SyntheticEvent } from "react";

import { deleteSatelliteAction, updateSatelliteAction } from "@/app/shack/satellites/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import {
  shackDangerButtonClass,
  shackInputClass,
  shackPrimaryButtonClass,
  shackSecondaryButtonClass,
} from "@/components/shack/styles";
import { OperatorSelect } from "@/components/shack/operator-select";
import { SATELLITE_NAME_MAX_LENGTH } from "@/lib/bounds";
import {
  INITIAL_FORM_STATE,
  type FormState,
  type OperatorOption,
  type SatelliteOption,
} from "@/lib/shack";

interface SatelliteListProps {
  operators: readonly OperatorOption[];
  satellites: readonly SatelliteOption[];
}

export function SatelliteList({ operators, satellites }: SatelliteListProps) {
  if (satellites.length === 0) {
    return (
      <p className="text-sm text-ink-dim">
        Nothing listed yet. Add the first satellite with the form beside this panel.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {satellites.map((satellite) => (
        <SatelliteRow key={satellite.noradId} operators={operators} satellite={satellite} />
      ))}
    </ul>
  );
}

function SatelliteRow({
  operators,
  satellite,
}: {
  operators: readonly OperatorOption[];
  satellite: SatelliteOption;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SatelliteEditor
        operators={operators}
        satellite={satellite}
        onClose={() => {
          setEditing(false);
        }}
      />
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-edge-soft bg-void/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-ink">{satellite.name}</span>
        {satellite.alternateName === null ? null : (
          <span className="text-sm text-ink-dim">{satellite.alternateName}</span>
        )}
        <span className="font-mono text-xs text-ink-faint">NORAD {satellite.noradId}</span>
      </div>

      <button
        type="button"
        className={shackSecondaryButtonClass}
        onClick={() => {
          setEditing(true);
        }}
      >
        Edit
      </button>
    </li>
  );
}

interface SatelliteEditorProps {
  onClose: () => void;
  operators: readonly OperatorOption[];
  satellite: SatelliteOption;
}

/**
 * Mounted only while a row is being edited, so every open starts from a clean action state and the
 * notice of a previous save cannot linger.
 */
function SatelliteEditor({ onClose, operators, satellite }: SatelliteEditorProps) {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await updateSatelliteAction(state, formData));
    });
  }

  function remove() {
    if (!window.confirm(`Remove ${satellite.name}? Only do this if it was added by mistake.`)) {
      return;
    }

    const formData = new FormData();

    formData.set("norad_id", String(satellite.noradId));

    startTransition(async () => {
      setState(await deleteSatelliteAction(state, formData));
    });
  }

  return (
    <li className="rounded-lg border border-signal/40 bg-void/30 px-4 py-3.5">
      <FormMessage className="mb-3.5" message={state.message} status={state.status} />

      <SatelliteEditFields
        key={state.resetKey}
        onClose={onClose}
        onRemove={remove}
        onSubmit={submit}
        operators={operators}
        pending={pending}
        satellite={satellite}
      />
    </li>
  );
}

interface SatelliteEditFieldsProps {
  onClose: () => void;
  onRemove: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  operators: readonly OperatorOption[];
  pending: boolean;
  satellite: SatelliteOption;
}

/**
 * Keyed on `resetKey`, which only advances after a save: a rejected edit keeps what was typed, while
 * a successful one remounts the fields on the values the server just stored.
 */
function SatelliteEditFields({
  onClose,
  onRemove,
  onSubmit,
  operators,
  pending,
  satellite,
}: SatelliteEditFieldsProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <input name="original_norad_id" type="hidden" value={satellite.noradId} />

      <div className="grid gap-3.5 sm:grid-cols-3">
        <Field htmlFor={`edit_satellite_name_${satellite.noradId}`} label="Name">
          <input
            id={`edit_satellite_name_${satellite.noradId}`}
            name="name"
            className={shackInputClass}
            defaultValue={satellite.name}
            maxLength={SATELLITE_NAME_MAX_LENGTH}
            required
          />
        </Field>

        <Field
          htmlFor={`edit_satellite_alternate_name_${satellite.noradId}`}
          label="Alternate name"
        >
          <input
            id={`edit_satellite_alternate_name_${satellite.noradId}`}
            name="alternate_name"
            className={shackInputClass}
            defaultValue={satellite.alternateName ?? ""}
            maxLength={SATELLITE_NAME_MAX_LENGTH}
          />
        </Field>

        <Field htmlFor={`edit_satellite_norad_id_${satellite.noradId}`} label="NORAD ID">
          <input
            id={`edit_satellite_norad_id_${satellite.noradId}`}
            name="norad_id"
            className={shackInputClass}
            defaultValue={satellite.noradId}
            inputMode="numeric"
            pattern="[0-9]*"
            required
          />
        </Field>
      </div>

      <OperatorSelect
        defaultValue={satellite.defaultOperatorId}
        id={`satellite_operator_${String(satellite.noradId)}`}
        operators={operators}
      />

      <div className="flex flex-wrap gap-2">
        <button className={shackPrimaryButtonClass} disabled={pending} type="submit">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={shackSecondaryButtonClass}
          disabled={pending}
          onClick={onClose}
        >
          Close
        </button>
        <button
          type="button"
          className={`${shackDangerButtonClass} sm:ml-auto`}
          disabled={pending}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </form>
  );
}
