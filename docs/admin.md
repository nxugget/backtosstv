# Running the shack

`/shack` is the admin section used to publish SSTV events from a phone. Sign-in uses Supabase Auth
**passkeys** (WebAuthn): nothing is emailed, the temporary password is retired as soon as a passkey
is registered, and the device's biometrics or security key does the work. The area is protected by
Supabase Auth and Row Level Security rather than by hiding the route, so the code is public and the
data behind it is not.

Everything past `/shack/login` requires a signed-in user whose id is present in `public.admins`.
Reads and writes on `sstv_events` and `satellites` are restricted to those users by Row Level
Security policies, so the same rules hold for any client that talks to Supabase directly. The
anonymous role holds no privileges on either table at all: the public API reads with the secret key,
which is what makes that API the only way into the catalogue.

The section is four screens: **Add event** publishes a transmission, **Events** lists what is
published and lets you edit, cancel or reinstate it, **Satellites** maintains the catalogue the
picker offers, and **Account** handles passkeys and invitations.

## Cancelling, and the absence of deleting

**Cancel** marks an announced transmission as called off. The row stays, the API keeps returning it
with `cancelled_at` set, and an application that had already cached the event finds out. Use it
whenever an event was published and then did not happen, which is the only thing that normally
happens to a published event. **Reinstate** undoes it.

There is no delete button, on purpose. An event is a record of what was announced, and the catalogue
is worth citing because that record does not move. The one case a delete would serve is an entry
that should never have been published at all (a false announcement, a test row), and that is rare
enough to be the owner's deliberate act rather than a red button at the end of a long evening. The
privilege is not granted to an administrator's session either, so it is not a matter of the button
being hidden.

Removing such a row means the SQL editor, with the project's own credentials:

```sql
delete from public.sstv_events where id = '…';
```

The `deleted_events` trigger records it, `/api/v1/deletions` publishes it, and a client that had
cached the row learns to drop it, which `?since=` cannot tell anyone on its own, a row that is gone
having no `updated_at` left to carry. The event's image stays in the `sstv-images` bucket; nothing
tidies it up on that path.

Every event should also carry its **source link**: the AMSAT bulletin, ARISS page or club post it
came from. The API publishes it, so anyone can check an entry against what was announced. That
traceability is most of why this catalogue is worth citing.

Passkeys are an experimental Supabase feature and need `@supabase/supabase-js` 2.105.0 or later.

## 1. Turn passkeys on

This step is dashboard-only today. Open **Authentication → Passkeys** in the Supabase dashboard and
set the WebAuthn relying party:

| Field                         | Value                                                                |
| ----------------------------- | -------------------------------------------------------------------- |
| Enable Passkey authentication | on                                                                   |
| Relying Party Display Name    | BackToSSTV                                                           |
| Relying Party ID              | the bare domain, e.g. `backtosstv.example` (no scheme, port or path) |
| Relying Party Origins         | `https://backtosstv.example`                                         |

The relying party ID is cryptographic: passkeys registered against one ID stop working if it is
changed later, so pick it before anyone enrols. Loopback addresses are exempt from the HTTPS
requirement, which is why `http://localhost:3000` works during development. The value has to match
the domain the site is served from, or sign-in fails with a relying-party mismatch.

The Management API can do the same thing if you would rather script it:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"passkey_enabled": true, "webauthn_rp_display_name": "BackToSSTV",
       "webauthn_rp_id": "backtosstv.example",
       "webauthn_rp_origins": "https://backtosstv.example"}'
```

## 2. Create the first administrator

Registering a passkey requires an existing session, and a passkey is the only way to sign in, so the
first one has to be created through a one-time bootstrap path. `/shack/bootstrap` is gated on a
secret token in the URL, and it only lets through an account that is listed in `admins` **and** does
not hold a passkey yet; what other administrators have is irrelevant.

1. Generate a bootstrap token and put it in the environment: `.env.local` locally, or the project's
   environment variables where it is deployed:

   ```bash
   openssl rand -hex 32   # copy the result into BOOTSTRAP_TOKEN
   ```

   Hex on purpose: the token travels in a URL query string, and base64 output can contain a `+`,
   which a URL parser decodes as a space, so the token no longer matches and `/shack/bootstrap`
   answers 404.

2. Create the user in the dashboard under **Authentication → Users → Add user**, with a password and
   **Auto Confirm User** ticked. Passkeys only work for confirmed accounts.
3. Grant access, and mark the account as the owner:

   ```sql
   insert into public.admins (user_id, is_owner)
   select id, true from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set is_owner = true;
   ```

   Only the owner can create further administrator accounts, which keeps that ability to whoever set
   the shack up. To hand it to someone else later, or to move it after a rebuild:

   ```sql
   update public.admins set is_owner = false;
   update public.admins set is_owner = true
   where user_id = (select id from auth.users where email = 'them@example.com');
   ```

4. Open `/shack/bootstrap?token=<the token>`, sign in with that email and password, and approve the
   passkey prompt. The account is checked server-side between the sign-in and the prompt, so a
   non-admin or an administrator who already has a passkey is turned away before any WebAuthn
   ceremony starts.
5. Sign in again with the passkey. Registering it retires the password: the app rotates it to a
   random value server-side, which is what makes the temporary password a genuine one-time secret.
   Changing an account's password drops every one of its sessions, this one included. Nothing to
   clean up by hand. If a screen ever reports that the password is still active, the rotation failed
   and it can be cleared manually:

   ```sql
   update auth.users set encrypted_password = null where email = 'you@example.com';
   ```

Without a matching token the route returns 404, the same response a path that does not exist gives,
so the screen does not advertise itself. `BOOTSTRAP_TOKEN` has to stay configured for as long as you
might need to bootstrap or invite, because with it unset the route is inert and the invite panel
cannot build a link; deleting it once everyone is enrolled is a reasonable final step.

This is also the lock-out recovery path: an administrator who has lost every passkey is once again
someone without one, so generate a token, set a new password in the dashboard and repeat steps 1
to 5.

## 3. Invite another administrator

Once you can sign in, the **Invite admin** panel on `/shack/settings` does the rest of the work: it
creates the account with a random temporary password, grants access by inserting the new `user_id`
into `public.admins`, and returns a bootstrap link with their email pre-filled.

That panel is reserved to the owner. The `admins` table refuses writes from an authenticated
session, so the invite action is the only way to add an administrator, and it checks `is_owner`
before doing anything. A non-owner who reaches it anyway is redirected with an explanation.

The link and the password are shown **once** and cannot be retrieved afterwards. Hand both over out
of band: in person, over a call, or a secure messenger, never email, since the point is not to lean
on email security. The password only has to survive until the new administrator registers their
passkey: the app retires it at that moment, and it stops working against the Supabase API as well as
in the app.

## 4. Add passkeys on your other devices

Signed in, open `/shack/settings` and press **Register this device** on each phone or laptop you
publish from. Registering also retires the account password and signs that session out, so expect to
sign in again with the passkey. The last remaining passkey cannot be removed, so the account cannot
be locked out by accident.

Event images are optional and stored in the public `sstv-images` bucket (5 MB limit,
JPEG/PNG/WebP/GIF). They are uploaded through a Server Action, which is why
`serverActions.bodySizeLimit` is raised in `next.config.ts`. The bucket is public because a browser
has to be able to load an image from the URL the API returns.

## Managing satellites

**Satellites** lists what the event picker offers. A satellite can be added here, renamed, given an
alternate name, or removed if it was added by mistake. The database refuses to remove one that
events point at, and the screen says so.

Renaming is the common case: the catalogue numbers are right and the names are often approximate.
The NORAD number is the key the events reference, so changing it is refused once events exist.

## Managing app users

**Users** lists the apps and websites that use the data, which the public `/credits` page shows
below the feeders. Each has a name, an optional official website and an optional logo. There is no
slug: nothing links to these rows but the credits page itself.

## Appearing on the Credits page

Open `/shack/settings` and tick **List me on the public Credits page as a data feeder**. The Credits
page reads this flag directly and shows the name and photo from your profile; a feeder without a
photo gets a placeholder with their initials.
