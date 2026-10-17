"use client";

import Image from "next/image";
import { useEffect, useState, useTransition, type SyntheticEvent } from "react";

import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import { SatelliteField } from "@/components/shack/satellite-field";
import {
  shackAlertClass,
  shackFileInputClass,
  shackInputClass,
  shackPrimaryButtonClass,
  shackSecondaryButtonClass,
  shackTextareaClass,
} from "@/components/shack/styles";
import {
  MAX_TRANSMIT_POWER_WATTS,
  SATELLITE_NAME_MAX_LENGTH,
  SOURCE_URL_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/bounds";
import { toUtcDateTimeInput } from "@/lib/format";
import {
  DEFAULT_SSTV_MODE,
  INITIAL_FORM_STATE,
  MAX_IMAGE_BYTES,
  SSTV_MODES,
  type EventFormInitial,
  type FormState,
  type OperatorOption,
  type SatelliteOption,
} from "@/lib/shack";

interface EventFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: EventFormInitial;
  operators: readonly OperatorOption[];
  satellites: readonly SatelliteOption[];
  submitLabel: string;
}

export function EventForm({ action, initial, operators, satellites, submitLabel }: EventFormProps) {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const startDefault =
    state.status === "success" ? toUtcDateTimeInput(new Date()) : initial.startTime;

  /**
   * Submitted from here rather than through a form action, because React clears every uncontrolled
   * field once one has run, which threw away what had just been typed whenever the server rejected
   * it. The keyed child still remounts on success, so a publish does leave the form empty.
   */
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await action(state, formData));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <FormMessage message={state.message} status={state.status} />

      <EventFields
        key={state.resetKey}
        initial={{ ...initial, startTime: startDefault }}
        onSubmit={submit}
        operators={operators}
        pending={pending}
        satellites={satellites}
        submitLabel={submitLabel}
      />
    </div>
  );
}

interface EventFieldsProps {
  initial: EventFormInitial;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  operators: readonly OperatorOption[];
  pending: boolean;
  satellites: readonly SatelliteOption[];
  submitLabel: string;
}

function EventFields({
  initial,
  onSubmit,
  operators,
  pending,
  satellites,
  submitLabel,
}: EventFieldsProps) {
  const [isNewSatellite, setIsNewSatellite] = useState(false);
  const [satellite, setSatellite] = useState<SatelliteOption | null>(
    findSatellite(satellites, initial.noradId),
  );
  const [operatorId, setOperatorId] = useState(initial.operatorId ?? "");
  const [frequency, setFrequency] = useState(initial.frequency);
  const [mode, setMode] = useState(initial.mode);
  const [imageIntervalSeconds, setImageIntervalSeconds] = useState(initial.imageIntervalSeconds);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const shownImageUrl = imagePreviewUrl ?? initial.imageUrl;

  useEffect(() => {
    return () => {
      if (imagePreviewUrl !== null) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  return (
    <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
      {initial.eventId === null ? null : <input name="id" type="hidden" value={initial.eventId} />}
      <input name="satellite_mode" type="hidden" value={isNewSatellite ? "new" : "existing"} />
      {isNewSatellite ? null : (
        <input
          name="norad_id"
          type="hidden"
          value={satellite === null ? "" : String(satellite.noradId)}
        />
      )}

      <div className="sm:col-span-2">
        {isNewSatellite ? (
          <div className="grid gap-4 rounded-lg border border-edge-soft bg-void/40 p-4 sm:grid-cols-2">
            <Field htmlFor="new_satellite_norad_id" label="New NORAD ID">
              <input
                id="new_satellite_norad_id"
                name="new_satellite_norad_id"
                className={shackInputClass}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="25544"
              />
            </Field>
            <Field htmlFor="new_satellite_name" label="New satellite name">
              <input
                id="new_satellite_name"
                name="new_satellite_name"
                className={shackInputClass}
                maxLength={SATELLITE_NAME_MAX_LENGTH}
                placeholder="ISS"
              />
            </Field>
            <Field
              className="sm:col-span-2"
              htmlFor="new_satellite_alternate_name"
              hint="Optional. The official name, or the older designation."
              label="New alternate name"
            >
              <input
                id="new_satellite_alternate_name"
                name="new_satellite_alternate_name"
                className={shackInputClass}
                maxLength={SATELLITE_NAME_MAX_LENGTH}
                placeholder="Zarya"
              />
            </Field>
            <button
              type="button"
              className={`${shackSecondaryButtonClass} sm:col-span-2 sm:justify-self-start`}
              onClick={() => {
                setIsNewSatellite(false);
              }}
            >
              Use an existing satellite
            </button>
          </div>
        ) : (
          <SatelliteField
            options={satellites}
            value={satellite}
            onChange={(chosen) => {
              setSatellite(chosen);

              // Most of a satellite's transmissions come from the same organisation, so choosing
              // one fills the operator in. It stays editable: the ISS carries both ARISS's series
              // and the Moscow Aviation Institute's, and IO-86's images are uplinked from the
              // ground by whoever is running that event.
              if (chosen.defaultOperatorId !== null) {
                setOperatorId(chosen.defaultOperatorId);
              }

              // The last event for that satellite usually reused the same frequency, mode and gap
              // between images, so those are filled in and stay editable. A satellite with no past
              // event has no history to copy, so the fields start empty (or the default mode).
              setFrequency(chosen.lastFrequency ?? "");
              setMode(chosen.lastMode ?? DEFAULT_SSTV_MODE);
              setImageIntervalSeconds(chosen.lastImageIntervalSeconds ?? "");
            }}
            onRequestNew={() => {
              setIsNewSatellite(true);
            }}
          />
        )}
      </div>

      <Field
        htmlFor="frequency"
        hint="MHz. Filled in from the satellite's last event."
        label="Frequency (MHz)"
      >
        <input
          id="frequency"
          name="frequency"
          className={shackInputClass}
          inputMode="decimal"
          placeholder="145.800"
          value={frequency}
          onChange={(event) => {
            setFrequency(event.target.value);
          }}
        />
      </Field>

      <Field htmlFor="mode" label="SSTV mode">
        <select
          id="mode"
          name="mode"
          className={shackInputClass}
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
          }}
        >
          {SSTV_MODES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="start_time" hint="UTC. Prefilled with now." label="Start time (UTC)">
        <input
          id="start_time"
          name="start_time"
          type="datetime-local"
          className={shackInputClass}
          required
          value={startTime}
          onChange={(event) => {
            setStartTime(event.target.value);
          }}
        />
        <button
          type="button"
          className={`${shackSecondaryButtonClass} self-start`}
          onClick={() => {
            setStartTime(toUtcDateTimeInput(new Date()));
          }}
        >
          Now
        </button>
      </Field>

      <Field
        htmlFor="end_time"
        hint="UTC. Set this every time; events often run for days."
        label="End time (UTC)"
      >
        <input
          id="end_time"
          name="end_time"
          type="datetime-local"
          className={shackInputClass}
          required
          value={endTime}
          onChange={(event) => {
            setEndTime(event.target.value);
          }}
        />
      </Field>

      <Field
        className="sm:col-span-2"
        htmlFor="source_url"
        hint="Where this was announced: an AMSAT bulletin, an ARISS page, a club post. Published by the API so anyone can check the entry."
        label="Source link"
      >
        <input
          id="source_url"
          name="source_url"
          type="url"
          className={shackInputClass}
          defaultValue={initial.sourceUrl}
          inputMode="url"
          maxLength={SOURCE_URL_MAX_LENGTH}
          placeholder="https://www.ariss.org/..."
          spellCheck={false}
        />
      </Field>

      <Field className="sm:col-span-2" htmlFor="title" label="Title">
        <textarea
          id="title"
          name="title"
          className={shackTextareaClass}
          defaultValue={initial.title}
          maxLength={TITLE_MAX_LENGTH}
          placeholder="Avoid the satellite name or “SSTV” unless there is no distinct title."
          rows={2}
        />
      </Field>

      <Field
        htmlFor="operator_id"
        hint={
          operators.length === 0
            ? "None yet. Add one on the Operators screen first."
            : "Who runs the transmission: ARISS, the university behind the satellite, a club."
        }
        label="Operator"
      >
        <select
          id="operator_id"
          name="operator_id"
          required
          className={shackInputClass}
          onChange={(event) => {
            setOperatorId(event.target.value);
          }}
          value={operatorId}
        >
          <option value="" disabled>
            Choose an operator
          </option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {operator.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        htmlFor="transmit_power_watts"
        hint="If the announcement gives it, such as 10 W for the ISS. Optional."
        label="Transmitter power (watts)"
      >
        <input
          id="transmit_power_watts"
          name="transmit_power_watts"
          className={shackInputClass}
          defaultValue={initial.transmitPowerWatts}
          inputMode="decimal"
          max={MAX_TRANSMIT_POWER_WATTS}
          placeholder="10"
          type="number"
          step="any"
        />
      </Field>

      <Field
        htmlFor="image"
        hint="JPEG, PNG, WebP or GIF, up to 5 MB. Optional."
        label="Image (optional)"
      >
        {shownImageUrl === null ? null : (
          <Image
            alt=""
            className="h-24 w-24 shrink-0 rounded object-cover"
            height={96}
            src={shownImageUrl}
            unoptimized
            width={96}
          />
        )}
        <input
          id="image"
          name="image"
          type="file"
          accept="image/gif,image/jpeg,image/png,image/webp"
          className={shackFileInputClass}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file === undefined) {
              setImageError(null);

              return;
            }

            if (file.size > MAX_IMAGE_BYTES) {
              event.target.value = "";
              setImageError("That image is larger than 5 MB.");

              return;
            }

            setImageError(null);
            setImagePreviewUrl(URL.createObjectURL(file));
          }}
        />
        {initial.imageUrl === null ? null : (
          <a
            className="text-xs text-signal underline"
            href={initial.imageUrl}
            target="_blank"
            rel="noreferrer"
          >
            View the current image
          </a>
        )}
        {imageError === null ? null : <p className={shackAlertClass}>{imageError}</p>}
      </Field>

      <Field
        htmlFor="image_interval_seconds"
        hint="The silence between two images, not counting the image itself. Filled in from the satellite's last event. Optional."
        label="Gap between images (seconds)"
      >
        <input
          id="image_interval_seconds"
          name="image_interval_seconds"
          className={shackInputClass}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="120"
          value={imageIntervalSeconds}
          onChange={(event) => {
            setImageIntervalSeconds(event.target.value);
          }}
        />
      </Field>

      <div className="sm:col-span-2">
        <button
          className={`${shackPrimaryButtonClass} w-full sm:w-auto`}
          disabled={pending}
          type="submit"
        >
          {pending ? "Publishing…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function findSatellite(
  satellites: readonly SatelliteOption[],
  noradId: number | null,
): SatelliteOption | null {
  if (noradId === null) {
    return null;
  }

  return satellites.find((option) => option.noradId === noradId) ?? null;
}
