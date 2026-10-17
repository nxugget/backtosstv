import Image from "next/image";

import { saveAdminProfileAction } from "@/app/shack/settings/actions";
import { InviteAdminPanel } from "@/components/shack/invite-admin-panel";
import { Panel } from "@/components/shack/panel";
import { PasskeyManager } from "@/components/shack/passkey-manager";
import { ShackShell } from "@/components/shack/shack-shell";
import { SignOutButton } from "@/components/shack/sign-out-button";
import {
  shackAlertClass,
  shackInputClass,
  shackLabelClass,
  shackNoticeClass,
  shackPrimaryButtonClass,
} from "@/components/shack/styles";
import { UploadPreview } from "@/components/shack/upload-preview";
import { listAdministrators } from "@/lib/admins";
import { listCurrentUserPasskeys, requireAdminSession } from "@/lib/auth";
import { ADMIN_NAME_MAX_LENGTH } from "@/lib/bounds";
import { SHACK_OWNER_ONLY_MESSAGE, SHACK_PASSWORD_LIVE_MESSAGE } from "@/lib/shack";

const ERRORS: Record<string, string> = {
  "avatar-failed": "That photo could not be uploaded.",
  "name-failed": "That name could not be saved.",
  "name-too-long": `Keep the name to ${String(ADMIN_NAME_MAX_LENGTH)} characters or fewer.`,
  "owner-only": SHACK_OWNER_ONLY_MESSAGE,
  "password-live": SHACK_PASSWORD_LIVE_MESSAGE,
  "profile-failed": "Your profile could not be saved.",
};

export default async function ShackSettingsPage(props: PageProps<"/shack/settings">) {
  const { email, isOwner, supabase, userId } = await requireAdminSession();
  const searchParams = await props.searchParams;
  const [passkeys, admins] = await Promise.all([
    listCurrentUserPasskeys(supabase),
    listAdministrators(),
  ]);

  const error = typeof searchParams.error === "string" ? ERRORS[searchParams.error] : undefined;
  const me = admins.find((admin) => admin.userId === userId);

  return (
    <ShackShell>
      {error === undefined ? null : <p className={shackAlertClass}>{error}</p>}

      <div className="flex justify-end">
        <SignOutButton />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel meta={`${String(passkeys?.length ?? 0)} registered`} title="Passkeys">
          <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
            Register a passkey on every device you publish from. Sign-in is tied to the device, not
            to a password, so a passkey on a second phone or laptop is what keeps the account
            reachable. Registering one also retires the account password, which signs you out.
          </p>

          <PasskeyManager passkeys={passkeys} />
        </Panel>

        <Panel meta={`${String(admins.length)} with access`} title="Administrators">
          <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
            Your name is what the other screens put next to the events you add or change, and your
            photo decorates it. No email addresses are shown there, so until you set a name your
            edits read as &ldquo;an administrator&rdquo;.
          </p>

          {me?.displayName === null || me?.displayName === undefined ? (
            <p className={`${shackNoticeClass} mb-4`}>Set your name so your edits carry it.</p>
          ) : null}

          <form action={saveAdminProfileAction} className="mb-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <label className={shackLabelClass} htmlFor="display_name">
                  Your name
                </label>
                <input
                  className={`${shackInputClass} mt-1.5`}
                  defaultValue={me?.displayName ?? ""}
                  id="display_name"
                  maxLength={ADMIN_NAME_MAX_LENGTH}
                  name="display_name"
                  placeholder={email ?? "Your name"}
                  type="text"
                />
              </div>
              <button className={shackPrimaryButtonClass} type="submit">
                Save profile
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 flex-1">
                <label className={shackLabelClass} htmlFor="avatar">
                  Your photo
                </label>
                <div className="mt-1.5">
                  <UploadPreview
                    accept="image/gif,image/jpeg,image/png,image/webp"
                    circle
                    currentUrl={me?.avatarUrl ?? null}
                    id="avatar"
                    name="avatar"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-dim">
              <input
                className="mt-0.5 h-4 w-4 accent-signal"
                defaultChecked={me?.shownOnCredits ?? false}
                name="shown_on_credits"
                type="checkbox"
              />
              <span>List me on the public Credits page as a data feeder.</span>
            </label>
          </form>

          <ul className="flex flex-col gap-2">
            {admins.map((admin) => (
              <li
                key={admin.userId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-edge-soft bg-void/30 px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {admin.avatarUrl === null ? (
                    <span className="h-6 w-6 shrink-0 rounded-full border border-edge-soft bg-panel/60" />
                  ) : (
                    <Image
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                      height={24}
                      src={admin.avatarUrl}
                      width={24}
                    />
                  )}
                  <span className="truncate text-sm text-ink">
                    {admin.displayName ?? (
                      <span className="text-ink-faint italic">no name set</span>
                    )}
                    {admin.userId === userId ? (
                      <span className="ml-2 text-xs text-ink-faint">you</span>
                    ) : null}
                  </span>
                </span>

                <span className="flex items-baseline gap-3">
                  {admin.userId === userId ? (
                    <span className="text-xs text-ink-faint">{admin.email}</span>
                  ) : null}
                  {admin.isOwner ? (
                    <span className="border border-edge-soft px-1.5 py-0.5 text-xs text-ink-dim">
                      owner
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {isOwner ? (
          <Panel meta="Out of band" title="Invite admin">
            <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
              Creates an account, grants admin access, and hands you a one-time link and temporary
              password to pass on in person or over a call. The new administrator signs in once,
              registers a passkey, and the password stops working the moment that passkey exists.
            </p>

            <InviteAdminPanel />
          </Panel>
        ) : (
          <Panel meta="Owner only" title="Invite admin">
            <p className="max-w-prose text-sm leading-relaxed text-ink-dim">
              {SHACK_OWNER_ONLY_MESSAGE}
            </p>
          </Panel>
        )}
      </div>
    </ShackShell>
  );
}
