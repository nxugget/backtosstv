"use client";

import Image from "next/image";
import { useState, useTransition, type SyntheticEvent } from "react";

import { deleteUserAction, updateUserAction } from "@/app/shack/users/actions";
import { Field } from "@/components/shack/field";
import { FormMessage } from "@/components/shack/form-message";
import {
  shackDangerButtonClass,
  shackInputClass,
  shackPrimaryButtonClass,
  shackSecondaryButtonClass,
} from "@/components/shack/styles";
import { UploadPreview } from "@/components/shack/upload-preview";
import { USER_NAME_MAX_LENGTH } from "@/lib/bounds";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/shack";

export interface UserRow {
  id: string;
  logoUrl: string | null;
  name: string;
  url: string | null;
}

export function UserList({ users }: { users: readonly UserRow[] }) {
  if (users.length === 0) {
    return <p className="text-sm text-ink-dim">None yet. Add the first one beside this.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {users.map((user) => (
        <Row key={user.id} user={user} />
      ))}
    </ul>
  );
}

function Row({ user }: { user: UserRow }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Editor
        onClose={() => {
          setEditing(false);
        }}
        user={user}
      />
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-edge-soft bg-void/30 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-3">
        <Logo user={user} />

        <span className="block truncate text-sm text-ink">{user.name}</span>
      </span>

      <span className="flex items-center gap-3">
        {user.url === null ? null : (
          <a
            className="text-xs text-signal underline"
            href={user.url}
            rel="noreferrer"
            target="_blank"
          >
            link
          </a>
        )}

        <button
          className={shackSecondaryButtonClass}
          onClick={() => {
            setEditing(true);
          }}
          type="button"
        >
          {user.logoUrl === null ? "Add logo" : "Edit"}
        </button>
      </span>
    </li>
  );
}

function Logo({ user }: { user: UserRow }) {
  if (user.logoUrl === null) {
    return <span className="w-8 shrink-0 text-center text-xs text-ink-faint">·</span>;
  }

  return (
    <Image
      alt=""
      className="h-8 w-8 shrink-0 rounded object-contain"
      height={32}
      src={user.logoUrl}
      width={32}
    />
  );
}

/** Mounted only while a row is open, so a previous save's notice cannot linger on the next one. */
function Editor({ onClose, user }: { onClose: () => void; user: UserRow }) {
  const [state, setState] = useState<FormState>(INITIAL_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setState(await updateUserAction(state, formData));
    });
  }

  function remove() {
    if (!window.confirm(`Remove ${user.name}?`)) {
      return;
    }

    const formData = new FormData();

    formData.set("id", user.id);

    startTransition(async () => {
      setState(await deleteUserAction(state, formData));
    });
  }

  return (
    <li className="rounded-lg border border-signal/40 bg-void/30 px-4 py-3.5">
      <FormMessage className="mb-3.5" message={state.message} status={state.status} />

      <form key={state.resetKey} onSubmit={submit} className="flex flex-col gap-4">
        <input name="id" type="hidden" value={user.id} />

        <Field htmlFor={`user_name_${user.id}`} label="Name">
          <input
            id={`user_name_${user.id}`}
            name="name"
            className={shackInputClass}
            defaultValue={user.name}
            maxLength={USER_NAME_MAX_LENGTH}
            required
          />
        </Field>

        <Field htmlFor={`user_url_${user.id}`} hint="Their official website." label="Link">
          <input
            id={`user_url_${user.id}`}
            name="url"
            className={shackInputClass}
            defaultValue={user.url ?? ""}
            placeholder="https://example.com/"
            type="url"
          />
        </Field>

        <Field
          htmlFor={`user_logo_${user.id}`}
          hint={
            user.logoUrl === null
              ? "Square works best. JPEG, PNG, WebP or GIF, up to 5 MB. The file's own name does not matter."
              : "Choosing a file replaces the current logo. Leave it empty to keep it."
          }
          label="Logo"
        >
          <UploadPreview
            accept="image/gif,image/jpeg,image/png,image/webp"
            currentUrl={user.logoUrl}
            id={`user_logo_${user.id}`}
            name="logo"
          />
          {user.logoUrl === null ? null : (
            <a
              className="text-xs text-signal underline"
              href={user.logoUrl}
              rel="noreferrer"
              target="_blank"
            >
              View the current logo
            </a>
          )}
        </Field>

        <div className="flex flex-wrap gap-2">
          <button className={shackPrimaryButtonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save"}
          </button>

          <button
            className={shackSecondaryButtonClass}
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            Done
          </button>

          <button
            className={shackDangerButtonClass}
            disabled={pending}
            onClick={remove}
            type="button"
          >
            Remove
          </button>
        </div>
      </form>
    </li>
  );
}
