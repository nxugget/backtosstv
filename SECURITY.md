# Security

## Reporting a vulnerability

**Please do not open a public issue or a pull request for it.** A patch is a working description of
the hole it closes, visible to everyone from the moment you push it. Use GitHub's private reporting
instead:

[Report a vulnerability](https://github.com/nxugget/backtosstv/security/advisories/new)

Tell us what you found, how to reproduce it and what it lets someone do. You should get an
acknowledgement within a few days: this is a hobby project run by volunteers, so please be patient
with the timeline, not with the severity.

The interesting things to look for are anything that reads or writes the database beyond what the
public API serves, anything that makes someone an administrator, and anything that reaches `/shack`
without the credentials it asks for. The policies, grants and constraints that are supposed to
prevent all three are in [`supabase/migrations`](./supabase/migrations), and
[`supabase/tests`](./supabase/tests) asserts them.

The public API reads two views, `public_events` and `public_satellites`, which hold exactly the
published columns: `created_by` and `updated_by` are not in them. The key the API reads with could
still reach the tables, so a path that gets data out of them which the views do not expose is worth
reporting even if the API itself looks correct.

## Not vulnerabilities

- **The publishable Supabase key in the page source.** It grants the anonymous role, which holds no
  privileges on any table and can call no function. The passkey ceremonies need it in the browser.
- **The catalogue being readable without a key.** That is the whole point of the API.
- **Event images being publicly fetchable.** They have to be, for an app to display them.
- **The request budget failing open.** It is a cost control, not a security boundary. Please do not
  demonstrate a flood.
- **`braces` in `npm audit`.** No patched release exists, and it only runs while ESLint expands this
  repository's own glob patterns. Everything else there is pinned, so any other advisory is real. CI
  audits the dependencies that reach production on every push, so an advisory against anything the
  deployment actually runs is news to us and worth reporting.
