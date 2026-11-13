"use client";

import { useState } from "react";

import { shackSecondaryButtonClass } from "@/components/shack/styles";
import { SHACK_LOGIN_PATH } from "@/lib/shack";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
    } catch (cause) {
      console.error("Failed to sign out", cause);
    }

    window.location.assign(SHACK_LOGIN_PATH);
  }

  return (
    <button
      type="button"
      className={shackSecondaryButtonClass}
      disabled={pending}
      onClick={() => {
        void signOut();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
