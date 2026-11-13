"use client";

import { useFormStatus } from "react-dom";

interface EventActionButtonProps {
  action: (formData: FormData) => Promise<void>;
  className: string;
  /** Asks before submitting. Omitted for an action that undoes itself. */
  confirmation?: string;
  id: string;
  label: string;
  pendingLabel: string;
}

/** One row's worth of destructive-ish action: cancel, restore or delete. */
export function EventActionButton({
  action,
  className,
  confirmation,
  id,
  label,
  pendingLabel,
}: EventActionButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirmation !== undefined && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      <SubmitButton className={className} label={label} pendingLabel={pendingLabel} />
    </form>
  );
}

function SubmitButton({
  className,
  label,
  pendingLabel,
}: {
  className: string;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : label}
    </button>
  );
}
