"use client";

import { useEffect } from "react";

import { shackPrimaryButtonClass, shackSecondaryButtonClass } from "@/components/shack/styles";
import { SHACK_LOGIN_PATH } from "@/lib/shack";

/**
 * A failed read from the database used to reach the visitor as Next.js's own error screen, Postgres
 * message included. This says what can be done instead: the admin is used from a phone in a field,
 * where retrying is usually the whole fix.
 */
export default function ShackError({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    console.error("Shack screen failed", error);
  }, [error]);

  return (
    <main className="shack-surface mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Something failed</h1>
        <p className="mt-1 text-sm text-ink-faint">That screen could not be loaded.</p>
      </header>

      <p className="max-w-prose text-sm leading-relaxed text-ink-dim">
        Usually a dropped connection to the database. Try again; if it keeps failing, sign in again
        from the login screen.
      </p>

      <div className="flex flex-wrap gap-3">
        <button className={shackPrimaryButtonClass} onClick={retry} type="button">
          Try again
        </button>
        <a className={shackSecondaryButtonClass} href={SHACK_LOGIN_PATH}>
          Sign in again
        </a>
      </div>
    </main>
  );
}
