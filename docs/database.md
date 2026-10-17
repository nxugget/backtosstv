# The database

Supabase, Postgres 17. Seven tables, four views, one enum, and the Row Level Security policies that
are the actual protection over the data. All of it lives in
[`../supabase/migrations`](../supabase/migrations): **nothing is configured only in the dashboard**,
with the one exception noted at the end.

## Working on the schema

```bash
supabase link --project-ref johbtzniovlbntcsuhdk   # once
supabase db reset                                  # rebuild the local database from migrations + seed
supabase migration new what_it_does                # write SQL, never change an applied migration
supabase db push                                   # apply to the hosted project
```

After any change, regenerate the types the application reads:

```bash
supabase gen types typescript --project-id johbtzniovlbntcsuhdk --schema public > src/lib/database.types.ts
npm run format
```

Two rules:

- **Never edit a migration that has been applied.** Write a new one. The hosted project records what
  it has run, and rewriting history breaks that.
- **Never change the schema from the dashboard.** `admins.is_owner` was added that way once, and the
  migration that reconciles it has to carry `if not exists` guards forever as a result.

## Tables

### `satellites`

Keyed by `norad_id`, the NORAD catalogue number, which is also what `sstv_events` references. `name`
is what the admin's picker shows; `alternate_name` is the official name or an older designation
(`ZARYA` for the ISS, `IO-86` for LAPAN-A2) and is searchable alongside the primary one.

### `sstv_events`

One announced transmission. `start_time`, `end_time`, `frequency` (numeric, MHz), `mode` (the
`sstv_mode` enum), and then what makes the row trustworthy:

| Column         | Why it exists                                                                     |
| -------------- | --------------------------------------------------------------------------------- |
| `source_url`   | the announcement the entry came from, published by the API so anyone can check it |
| `cancelled_at` | a withdrawn event keeps its row, so cached clients learn it is off                |
| `updated_at`   | what `?since=` filters on, so clients synchronise instead of refetching           |
| `created_by`   | which administrator published it                                                  |
| `updated_by`   | which administrator last changed it                                               |

`created_*` and `updated_*` are maintained by the `stamp_write()` trigger and are not writable, even
by an administrator who may write every other column: on update the trigger restores the original
`created_at` and `created_by` from the existing row.

`created_by` and `updated_by` hold user ids and **are never returned by the public API**.

### `api_request_counters`

Where the public API's request budget is counted, one row per caller rather than one per window, so
the table stays as small as the number of callers. Only the secret key touches it, and only through
`count_api_request()`, which counts a request and returns the caller's total for the current window
in one statement, so two requests arriving together cannot read the same total. A window that has
passed is treated as a new one without anything resetting it, and one request in a hundred also
drops the callers nobody is counting against any more, which keeps the table bounded without a
scheduler.

Setting a Redis takes the counting out of the database entirely; see
[`../src/lib/api/rate-limit.ts`](../src/lib/api/rate-limit.ts).

### `operators`

Who runs a transmission: ARISS, the university behind the satellite, a club. A table rather than a
string on each event, because the same organisation comes back every time and because a row is where
a `logo_url` and a link can live, which is what lets an application show whose transmission it is.
`slug` is the stable, lowercase identifier the API publishes; it is safe in a URL and does not
change once events point at it.

`satellites.default_operator_id` is the organisation a satellite's transmissions usually come from.
It is a convenience for the admin, pre-selected when that satellite is chosen on the event screen
and editable there, never the answer. One satellite can carry more than one organisation's SSTV: the
ISS runs both ARISS's series and the Moscow Aviation Institute's MAI-75 from the Russian module, and
IO-86 has no SSTV transmitter at all, its images being uplinked from the ground through the FM
transponder by whoever runs that event. Removing an operator clears this column rather than
refusing, because a convenience should give way.

`sstv_events.operator_id` is `not null`: every event names who runs it. The form is not the only
writer, so the rule lives in the database rather than only in the admin: a row inserted from the SQL
editor or by a future importer carries an operator too, or the API would serve an event nobody is
answerable for.

### `deleted_events`

One row per deleted event: the `id` it had, and when it went. Written by the
`record_event_deletion()` trigger, read by the public API through `public_deletions`, and by nothing
else.

`?since=` reports every change except the one that removes the row it would have reported on, so
without this a client that had cached an event entered in error kept it forever. A cancelled event
is a different thing and needs none of this: it keeps its row and gains `cancelled_at`.

**Who can delete one at all**: not the application. `20261017150000_events_are_not_deleted.sql` took
the policy and the grant away along with the button, so an administrator's session is refused the
statement. What is left is the secret key, from the SQL editor: a deliberate act on a row that
should never have been published, with no policy and no code review in front of it. That is exactly
the writer this schema keeps being designed against, and the trigger is what makes the act visible
instead of silent.

It is not a soft delete, deliberately: `deleted_at` on `sstv_events` would mean every read in the
application, and every future one, has to remember to exclude it, a rule enforced by remembering
rather than by the database, which is the kind this schema tries not to have. An earlier version of
this reasoning also claimed the unique index on `(norad_id, start_time, frequency)` would refuse the
corrected entry a deletion made room for; that argument is thin, since a correction almost always
changes one of those three columns and so collides with nothing. The first reason is the real one.

The trigger function is `security definer` so that the record does not depend on who did the
deleting. Whatever privileges that role holds on `deleted_events` (today, none for anyone but the
secret key), the row is written by the function's owner. Its `search_path` is pinned and nobody
holds EXECUTE on it, so the only way in is the trigger. The schema tests delete an event with the
owner's rights and check the row is there, and check that an administrator's session is refused the
delete outright.

Nothing prunes the table. A row is a uuid and a timestamp, the API promises consumers at least 180
days, and keeping them is how that promise is met.

### `app_users`

The apps and sites that use the data, shown on the public Credits page below the feeders. Each row
holds a `name`, an optional official `url`, and an optional `logo_url`. Nothing references this
table and nothing in the public API reads it: it exists only for the Credits page, which reads it
with the secret key and a fixed column list.

### The `public_` views

`public_events`, `public_satellites`, `public_operators` and `public_deletions` hold **exactly**
what the API publishes, and nothing else. `public_credit_feeders` and `public_credit_apps` do the
same job for the Credits page, which is the one public page served with the secret key.

The public reads go through the secret key, which bypasses Row Level Security, so the tables are not
what stops a column being published. Before these existed, the only thing between `created_by` and
the internet was a column list in [`../src/lib/api/catalogue.ts`](../src/lib/api/catalogue.ts) and
whoever reviewed the next change to it: the blast radius of one careless `select` was the whole
database. `created_by` and `updated_by` are not columns of these views, so no selection from them
can publish one, `select *` included.

`public_operators` is where the slug earns its keep: the table's `id` is not in the view at all, so
the uuid an event points at internally never reaches a client, and `slug` is the only identifier the
API has ever published.

They are flat: `public_events` joins `satellites` and `operators` itself and exposes
`satellite_name`, `operator_slug` and the rest, which the API nests back into its JSON the way it
always did. Both joins are on `not null` foreign keys, so no event can fall out of the view, and an
assertion compares the two row counts in case one of those columns ever becomes nullable.

Two things make them more than documentation:

- **`security_invoker = true`.** Without it a view runs with its owner's privileges, which would
  hand anyone holding SELECT a way past Row Level Security on the tables underneath. An assertion
  fails the build if either view loses it.
- **The privileges are written out.** Supabase's default privileges hand every new relation in
  `public` to all three API roles, and a view is a relation. Left alone, these two would have been
  readable straight from PostgREST with the publishable key, which is the door
  `20261015143436_restrict_public_reads.sql` closed. So `anon` and `authenticated` hold nothing on
  them, and the secret key holds `select` and nothing else.

This is defence in depth, not a new boundary: the secret key can still read the tables. What it buys
is that the published columns are now a thing with a name, and that a mistake in the reading code
publishes nothing it was not already allowed to.

#### The two credits views

`public_credit_feeders` is `display_name` and `avatar_url` from `admins`, for the rows where
`shown_on_credits` is true. Both halves of that matter. The page read `admins` directly and selected
`id` along with the name and the photo, and rendered it as a React list key, so every delivered
`/credits` page carried an administrator's `auth.users` id, which is the same value
[`../src/lib/api/catalogue.ts`](../src/lib/api/catalogue.ts) deliberately never publishes in
`created_by`. The id is not a column of the view, so the page cannot carry it again; it keys the
list by position instead, which is what a server-rendered whole list can do. And the opt-in is the
view's `where` rather than the caller's, so a read that forgets the filter still cannot list an
administrator who never agreed to be named. An assertion checks that
`update admins set shown_on_credits = false` makes the view empty.

`public_credit_apps` is `id`, `name`, `url` and `logo_url` from `app_users`, and keeps its `id`: it
identifies a row in a table whose whole content is meant to be public, which is a different thing
from identifying somebody's account. What it leaves behind is `created_by`, `updated_by` and the
timestamps.

### `admins`

The access model, in one table: a row means administrator. `is_owner` marks the single account that
may create more administrators, enforced by a unique partial index, so two owners cannot exist. The
table refuses writes from any authenticated session: only the invite flow, running with the secret
key, can add a row.

## Who can read and write what

| Role            | `satellites`                   | `sstv_events`                                          | the public views | `deleted_events` | `admins`           |
| --------------- | ------------------------------ | ------------------------------------------------------ | ---------------- | ---------------- | ------------------ |
| `anon`          | nothing                        | nothing: no grants, no policies                        | nothing          | nothing          | nothing            |
| `authenticated` | read and write if `is_admin()` | read, insert, update if `is_admin()`, **never delete** | nothing          | nothing          | read their own row |
| secret key      | everything (bypasses RLS)      | everything (bypasses RLS)                              | `select`         | everything       | everything         |

The anonymous role holding **no** privileges is the point: the publishable key is inlined in the
browser bundle, so anything `anon` could read would be readable straight from PostgREST, with no
page size, no cache and no attribution. The public API therefore reads with the secret key, through
[`../src/lib/api/catalogue.ts`](../src/lib/api/catalogue.ts) and nowhere else. That module bypasses
RLS, so it reads the two public views rather than the tables, and names its columns explicitly
anyway.

Event images are different: the `sstv-images` bucket is public, because a browser has to be able to
load an image from the URL the API returns.

Functions are granted the same way, and need the same care, because Supabase hands EXECUTE on every
new function in `public` to both API roles by default, and PostgREST exposes them at
`/rest/v1/rpc/<name>`:

| Function                  | Who may call it                 |
| ------------------------- | ------------------------------- |
| `count_api_request()`     | the secret key only             |
| `is_admin()`              | `authenticated`, the secret key |
| `stamp_write()`           | nobody                          |
| `record_event_deletion()` | nobody                          |

`is_admin()` has to stay callable by `authenticated`, because a policy expression is evaluated with
the privileges of the role doing the reading: revoke it and an administrator's own screens answer
`42501 permission denied for function is_admin`. `stamp_write()` needs no grant at all, because
Postgres fires a trigger without asking whether the writer may call the function by name. Neither
does `record_event_deletion()`, and in its case that matters more: it is `security definer`, and a
`security definer` function anyone may call by name is how a privilege escalation starts.

Each of those grants is written out in a migration rather than left as whatever the platform's
default happened to be, and every one of them is asserted by the schema tests.

## Constraints

The database checks what the forms check: an end after the start, a duration under 90 days (longer
is a mistyped year), a frequency in range, an image interval inside a day, bounded text lengths,
trimmed names, `http(s)` on every URL the API republishes, and a unique index on
`(norad_id, start_time, frequency)` so the same transmission cannot be published twice while a
satellite transmitting on two frequencies at once stays legal.

The numbers are mirrored in [`../src/lib/shack.ts`](../src/lib/shack.ts) so a form can say what is
wrong before a write fails. Change one, change both.

## Indexes

`(start_time, id)` serves the API's ordering in both directions: a btree scans backwards, so one
index covers `upcoming` and `past`. `end_time` serves the `live` and `past` filters, `updated_at`
serves `?since=`, and `norad_id` serves the join and the filter. `(operator_id, start_time, id)`
serves `?operator=`, and in particular the exact `COUNT` every list request runs beside the page:
measured, that count is a bitmap index scan on both columns, while the page query itself still
prefers `(start_time, id)` because it is already in the order asked for.
`deleted_events (deleted_at, id)` is the order the deletions feed pages in.

`?norad_id=` needs no index of its own: `sstv_events_no_duplicate_idx`, the unique index on
`(norad_id, start_time, frequency)`, leads with that column and serves the lookup. Three indexes
have now been dropped for leading with a column a wider one already led with (`start_time`,
`operator_id`, `norad_id`), and each time the plan was read before and after rather than assumed.

## Testing it

The policies are the only thing between the publishable key and the catalogue, so they are tested
rather than trusted:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:schema
```

It builds the schema from the migrations on an empty database and asserts what it must guarantee:
that `anon` cannot read, write or truncate the catalogue tables; that a signed-in non-administrator
sees nothing; that an administrator reads and writes but still cannot touch `admins`; that two
owners are impossible; that every bound is enforced; that a duplicate event is refused while a
second frequency at the same instant is not; that an administrator cannot forge `created_by` or
backdate `updated_at`; that every table enforces Row Level Security; and that `anon` can call no
function in this schema while `authenticated` can call only `is_admin()`. CI runs it against a
Postgres service container on every push.

It needs a Postgres 15 or later and nothing else: no Supabase, no Docker.
[`../supabase/tests/00-platform.sql`](../supabase/tests/00-platform.sql) recreates the handful of
platform objects the migrations lean on: the three roles, `auth.uid()`, enough of `storage`, and the
default privileges that hand new tables **and new functions** to the API roles. Without those, the
migrations that take those privileges back would pass as no-ops.

Writing those tests found a real hole. `create table` does not enable Row Level Security, and no
migration did either: the hosted project was protected only because Supabase installs an event
trigger that enables RLS on every new table in `public`. Rebuilt anywhere that trigger does not run
(a local `supabase db reset`, a new project, a self-hosted Postgres), the tables came back with
every policy present and none of them enforced. `20261015153706_enable_row_level_security.sql` says
it explicitly now, and one assertion fails the build if any table in `public` ever stops enforcing
it.

## One thing still in the dashboard

**Passkeys.** Enabling WebAuthn and setting the relying party is a project-level auth setting with
no migration equivalent; [`admin.md`](./admin.md) has the steps and the Management API call.

## History and squashing

The whole pre-launch schema lives in one file:
[`../supabase/migrations/20261017220000_baseline.sql`](../supabase/migrations/20261017220000_baseline.sql).
The development history was squashed into it while the API was still unreleased, and the hosted
project's history was repaired to match. A new database, including the schema-test CI job, builds
the entire schema from that single file.

The procedure for the next squash, while the API is still unreleased:

1. Concatenate every file in `supabase/migrations` into a new `YYYYMMDDHHMMSS_baseline.sql`.
2. Delete the files it replaced.
3. Repair the hosted history. Revert the old versions, then record the baseline as applied:

```bash
supabase migration repair --status reverted <old versions...>
supabase migration repair --status applied <new baseline version>
```

`migration repair` rewrites only the history table; it runs no DDL. Marking the baseline applied
records it without running it, which is right for a project that already has the schema, while a new
database runs the baseline for real, so the two stay identical.
