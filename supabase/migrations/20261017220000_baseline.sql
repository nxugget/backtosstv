-- Baseline: the whole pre-launch schema in one file.
-- The project has not shipped, so the development history is squashed here instead of
-- kept as a long trail of migrations. New work goes in a new migration on top of this one.

create table satellites (
  norad_id integer primary key,
  name text not null
);

create type sstv_mode as enum (
  'Robot 36', 'Robot 72',
  'Martin 1', 'Martin 2',
  'Scottie 1', 'Scottie 2', 'Scottie DX',
  'PD50', 'PD90', 'PD120', 'PD160', 'PD180', 'PD240'
);

create table sstv_events (
  id uuid primary key default gen_random_uuid(),
  norad_id integer not null references satellites(norad_id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  frequency numeric(10,4) not null,
  mode sstv_mode not null,
  description text,
  image_url text,
  image_interval_seconds integer,
  created_at timestamptz not null default now()
);

create index sstv_events_norad_id_idx on sstv_events(norad_id);
create index sstv_events_start_time_idx on sstv_events(start_time);

-- ============================================================
-- 20260914120952_shack_admin_access.sql
-- ============================================================
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admins enable row level security;

create policy "Admins can read their own row"
  on public.admins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  );
$$;

create policy "Public can read sstv_events"
  on public.sstv_events
  for select
  to anon, authenticated
  using (true);

create policy "Admins can insert sstv_events"
  on public.sstv_events
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update sstv_events"
  on public.sstv_events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete sstv_events"
  on public.sstv_events
  for delete
  to authenticated
  using (public.is_admin());

create policy "Public can read satellites"
  on public.satellites
  for select
  to anon, authenticated
  using (true);

create policy "Admins can insert satellites"
  on public.satellites
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update satellites"
  on public.satellites
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete satellites"
  on public.satellites
  for delete
  to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sstv-images',
  'sstv-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read sstv images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'sstv-images');

create policy "Admins can upload sstv images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'sstv-images' and public.is_admin());

create policy "Admins can replace sstv images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'sstv-images' and public.is_admin())
  with check (bucket_id = 'sstv-images' and public.is_admin());

create policy "Admins can delete sstv images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'sstv-images' and public.is_admin());

-- ============================================================
-- 20260914121002_shack_is_admin_search_path.sql
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  );
$$;

-- ============================================================
-- 20261015094040_add_satellite_alternate_name.sql
-- ============================================================
alter table public.satellites
  add column alternate_name text;

comment on column public.satellites.alternate_name is
  'Secondary or official name, displayed next to the primary name.';

-- ============================================================
-- 20261015132203_admins_is_owner.sql
-- ============================================================
-- `is_owner` was added straight to the hosted project, before migrations were kept in the
-- repository. The guards let this run both there and against a database created from scratch.

alter table public.admins
  add column if not exists is_owner boolean not null default false;

comment on column public.admins.is_owner is
  'Only the owner may create further administrators. At most one row carries it.';

-- The access model is the rows of this table, so the right to hand out more of them belongs to one
-- account. Clearing the flag before setting it elsewhere is what makes a handover possible; doing it
-- the other way round fails here rather than leaving two owners.
create unique index if not exists admins_single_owner_idx
  on public.admins (is_owner)
  where is_owner;

-- ============================================================
-- 20261015134918_event_curation_columns.sql
-- ============================================================
-- What a catalogue needs beyond the transmission itself: where the information came from, when the
-- row last changed, who changed it, and whether the event was called off rather than never held.

-- Traceability. A frequency and a date are only worth as much as the announcement behind them.
alter table public.sstv_events
  add column source_url text,
  -- Withdrawing an event is not the same as never having published it. A consumer that cached an
  -- upcoming transmission has to learn it was called off, which a deleted row cannot tell it.
  add column cancelled_at timestamptz,
  -- Incremental synchronisation. Without this a client refetches the whole catalogue to notice that
  -- one row changed.
  add column updated_at timestamptz not null default now(),
  -- Who typed it. Three people curate by hand, so a wrong value has to lead back to a person.
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null;

alter table public.satellites
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null;

comment on column public.sstv_events.source_url is
  'Announcement this event was taken from: an AMSAT bulletin, an ARISS page, a club post.';

comment on column public.sstv_events.cancelled_at is
  'Set when the transmission was called off. The row stays, and the API keeps returning it.';

comment on column public.sstv_events.created_by is
  'Administrator who published the event. Internal: the public API never returns it.';

comment on column public.sstv_events.updated_by is
  'Administrator who last changed the event. Internal: the public API never returns it.';

-- ============================================================
-- 20261015140924_event_value_constraints.sql
-- ============================================================
-- The application is not the only writer: a row inserted from the SQL editor, by a future importer
-- or by a bug has to be as trustworthy as one typed into the admin. These bounds are what the admin
-- forms validate too, and the database is where that agreement is kept.

alter table public.sstv_events
  add constraint sstv_events_time_order
    check (end_time > start_time),
  -- An SSTV campaign can run for days. Months means a mistyped year.
  add constraint sstv_events_duration
    check (end_time <= start_time + interval '90 days'),
  add constraint sstv_events_frequency_range
    check (frequency > 0 and frequency <= 100000),
  add constraint sstv_events_image_interval_range
    check (image_interval_seconds is null or image_interval_seconds between 1 and 86400),
  add constraint sstv_events_description_length
    check (description is null or char_length(description) <= 2000),
  add constraint sstv_events_image_url_length
    check (image_url is null or char_length(image_url) <= 2000),
  add constraint sstv_events_source_url_length
    check (source_url is null or char_length(source_url) between 1 and 2000),
  add constraint sstv_events_norad_id_range
    check (norad_id > 0 and norad_id <= 999999999);

-- ============================================================
-- 20261015141152_satellite_value_constraints.sql
-- ============================================================
alter table public.satellites
  add constraint satellites_norad_id_range
    check (norad_id > 0 and norad_id <= 999999999),
  add constraint satellites_name_length
    check (char_length(name) between 1 and 80),
  -- The forms trim before writing. This is what makes "ISS " and "ISS" impossible to both exist.
  add constraint satellites_name_trimmed
    check (name = btrim(name)),
  add constraint satellites_alternate_name_length
    check (alternate_name is null or char_length(alternate_name) between 1 and 80),
  add constraint satellites_alternate_name_trimmed
    check (alternate_name is null or alternate_name = btrim(alternate_name));

-- ============================================================
-- 20261015142000_event_catalogue_indexes.sql
-- ============================================================
-- Two people watching the same announcement will eventually enter it twice. A satellite can
-- transmit on two frequencies at once, so the frequency is part of what makes an event distinct.
create unique index sstv_events_no_duplicate_idx
  on public.sstv_events (norad_id, start_time, frequency);

-- `start_time, id` is the order the API pages by, in both directions: a btree serves the descending
-- scan too, so one index covers `upcoming` and `past`. `end_time` is what `live` and `past` filter
-- on, and `updated_at` is what an incremental client asks for.
create index sstv_events_start_time_id_idx
  on public.sstv_events (start_time, id);

create index sstv_events_end_time_idx
  on public.sstv_events (end_time);

create index sstv_events_updated_at_idx
  on public.sstv_events (updated_at);

-- ============================================================
-- 20261015142430_stamp_write_audit_trail.sql
-- ============================================================
create or replace function public.stamp_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    -- Administrators may update every column, so the row's own history is restored rather than
    -- trusted: only this trigger decides what created_at and created_by hold.
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());

  return new;
end;
$$;

comment on function public.stamp_write() is
  'Maintains created_at, created_by, updated_at and updated_by. The columns are not writable.';

create trigger sstv_events_stamp_write
  before insert or update on public.sstv_events
  for each row
  execute function public.stamp_write();

create trigger satellites_stamp_write
  before insert or update on public.satellites
  for each row
  execute function public.stamp_write();

-- ============================================================
-- 20261015143436_restrict_public_reads.sql
-- ============================================================
-- The catalogue is public, but this API is how it gets published.
--
-- Until now `anon` could select both tables, and the publishable key that grants `anon` is inlined
-- in the browser bundle Ã¢â‚¬â€ it has to be, the passkey ceremonies run client-side. Anyone could
-- therefore read the tables straight from PostgREST: no page size, no cache, no attribution, and
-- the egress billed here. Rate limits and usage figures would have stayed unenforceable, because
-- the endpoint was not the only door.
--
-- So the door closes. The route handlers read with the secret key, which bypasses RLS, and nothing
-- reaches these tables with the publishable one. The images stay readable by anyone, since a
-- browser has to be able to load them from the URL the API returns.
--
-- The two permissive policies are altered rather than dropped and recreated, which keeps their
-- identity and makes the change legible as what it is: the same read, narrowed.

alter policy "Public can read sstv_events" on public.sstv_events rename to "Admins can read sstv_events";

-- The admin screens read with the signed-in administrator's session, so they need the narrowed
-- policy now that the permissive one is gone.
alter policy "Admins can read sstv_events" on public.sstv_events
  to authenticated
  using (public.is_admin());

alter policy "Public can read satellites" on public.satellites rename to "Admins can read satellites";

alter policy "Admins can read satellites" on public.satellites
  to authenticated
  using (public.is_admin());

-- Row Level Security already refused every one of these to `anon`, having no policy to allow them.
-- They are revoked because a privilege that is never meant to be used should not be granted, and
-- because TRUNCATE is not subject to RLS at all: it is only out of reach today because PostgREST
-- never issues it.
revoke all on table public.admins from anon;

revoke all on table public.satellites from anon;

revoke all on table public.sstv_events from anon;

revoke truncate, references, trigger on table public.admins from authenticated;

revoke truncate, references, trigger on table public.satellites from authenticated;

revoke truncate, references, trigger on table public.sstv_events from authenticated;

-- ============================================================
-- 20261015153706_enable_row_level_security.sql
-- ============================================================
-- The policies on these two tables were never enforced by anything in this repository.
--
-- `create table` does not turn Row Level Security on, and neither did any migration. The hosted
-- project is protected only because Supabase installs an event trigger, `rls_auto_enable`, that
-- enables RLS on every table created in `public` Ã¢â‚¬â€ a platform convenience, invisible here. Rebuild
-- this schema anywhere that trigger does not exist, which includes a local `supabase db reset`, and
-- the tables come back with every policy present and none of them applied: readable and writable by
-- anyone holding the publishable key.
--
-- `admins` was never exposed, having enabled RLS explicitly in the migration that created it. This
-- makes the other two say so too. Both statements are no-ops against the hosted project, where the
-- event trigger got there first.

alter table public.satellites enable row level security;

alter table public.sstv_events enable row level security;

-- ============================================================
-- 20261015182335_api_request_counters.sql
-- ============================================================
-- Where the public API's request budget is counted when no Redis is configured.
--
-- Redis is better at this: a counter in the catalogue's own database means a write in front of the
-- read it is protecting. But a budget that only works once somebody has signed up elsewhere is not
-- a budget, and the secret key is already present wherever the API runs, so this backend is always
-- available and the limit is enforced from the first deployment. Configuring Redis takes over.
--
-- One row per caller rather than one per window, so the table stays as small as the number of
-- callers rather than growing with time.

create table public.api_request_counters (
  client text primary key,
  window_started_at timestamptz not null,
  requests integer not null
);

comment on table public.api_request_counters is
  'Request budget counters for the public API. Written only by the service role, through count_api_request().';

alter table public.api_request_counters enable row level security;

-- No policies: nothing but the secret key, which bypasses Row Level Security, has any business
-- here. The grants go too, so the API roles cannot reach the table even by accident.
revoke all on table public.api_request_counters from anon, authenticated;

/**
 * Counts one request against `p_client` and returns how many it has made in the current window.
 *
 * The window is derived from the clock, so a new one starts without anything having to reset it: a
 * row whose window has passed is counted as the first request of the new one.
 */
create function public.count_api_request(p_client text, p_window_seconds integer)
returns integer
language plpgsql
as $$
declare
  current_window timestamptz := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  total integer;
begin
  insert into public.api_request_counters as counters (client, window_started_at, requests)
  values (p_client, current_window, 1)
  on conflict (client) do update
    set requests = case
          when counters.window_started_at = current_window then counters.requests + 1
          else 1
        end,
        window_started_at = current_window
  returning counters.requests into total;

  -- Keeps the table bounded without a scheduler: now and then, drop the callers nobody is counting
  -- against any more. One in a hundred requests pays for it, and only with a small delete.
  if random() < 0.01 then
    delete from public.api_request_counters
    where window_started_at < clock_timestamp() - interval '1 hour';
  end if;

  return total;
end;
$$;

comment on function public.count_api_request(text, integer) is
  'Counts one request against a caller and returns its total for the current window.';

-- Only the service role calls this, from the API's rate limiter.
revoke all on function public.count_api_request(text, integer) from public;

grant execute on function public.count_api_request(text, integer) to service_role;

-- ============================================================
-- 20261015193000_restrict_function_execution.sql
-- ============================================================
-- Takes back the EXECUTE privileges Supabase grants by default on everything in `public`, and pins
-- the search path of the one function that was missing it.
--
-- Supabase's default privileges grant `anon` and `authenticated` EXECUTE on each new function in
-- this schema, explicitly rather than through PUBLIC Ã¢â‚¬â€ so the earlier
-- `revoke all ... from public` on count_api_request left both roles holding it. Nothing was
-- readable through them, because the privileges on the tables underneath are what actually decide:
-- `anon` calling count_api_request got `42501 permission denied for table api_request_counters`.
-- But a privilege nobody is meant to use should not be granted, and a reader auditing this schema
-- should not have to follow two hops to find out that the first one is harmless.

-- Each role that needs a function is granted it here rather than left holding whatever the
-- platform's default privileges happened to give it. A grant that exists by default is a grant that
-- a revoke somewhere else can take away without anything saying so.

-- The rate limiter's counter. Only the secret key calls it.
revoke all on function public.count_api_request(text, integer) from public, anon, authenticated;
grant execute on function public.count_api_request(text, integer) to service_role;

-- A mutable search path lets whoever sets it decide which `api_request_counters` the function
-- writes to. Only the service role can call it, so this closes a door that was already locked, and
-- it matches is_admin() and stamp_write(), which were already pinned this way.
alter function public.count_api_request(text, integer) set search_path = '';

-- Every Row Level Security policy calls is_admin(), and a policy expression is evaluated with the
-- privileges of the role doing the reading Ã¢â‚¬â€ so `authenticated` has to be able to call it, or an
-- administrator's own screens answer `42501 permission denied for function is_admin`. No policy
-- applies to `anon`, which therefore never reaches it.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- A trigger function is reached through its trigger, which Postgres fires without asking whether
-- the writer may call the function by name Ã¢â‚¬â€ so nobody needs EXECUTE on this one. The schema tests
-- write as an administrator and check the audit columns afterwards, which is what proves it.
revoke all on function public.stamp_write() from public, anon, authenticated;

/**
 * Supabase's own event trigger, which enables Row Level Security on every table created in this
 * schema. It is created by the platform rather than by this repository, so it is only touched if it
 * is there, and a project that does not have it is left alone.
 *
 * It returns `event_trigger`, a pseudo-type Postgres cannot render, so asking for it over HTTP
 * answers `0A000 cannot display a value of type event_trigger` without the body ever running. The
 * grant still has no purpose, and leaving it in place means every security audit of this project
 * starts by re-deriving that paragraph.
 */
do $$
begin
  if exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_proc.proname = 'rls_auto_enable'
      and pg_namespace.nspname = 'public'
      and pg_proc.pronargs = 0
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

-- ============================================================
-- 20261015194000_drop_redundant_start_time_index.sql
-- ============================================================
-- `sstv_events_start_time_id_idx` leads with `start_time`, so a lone index on that column answers
-- nothing the composite one does not. It is only write cost.
--
-- Not yet applied to the hosted project: see docs/database.md.
drop index if exists public.sstv_events_start_time_idx;

-- ============================================================
-- 20261015210000_admin_display_name.sql
-- ============================================================
-- A name to put on an administrator, so that `created_by` and `updated_by` read as people rather
-- than as user ids.
--
-- Nullable: an administrator who has not set one is shown by their email address, which GoTrue
-- already holds. Nothing in the public API reads this column Ã¢â‚¬â€ who curated a row is internal.

alter table public.admins
  add column display_name text;

alter table public.admins
  add constraint admins_display_name_trimmed
    check (display_name is null or display_name = btrim(display_name)),
  add constraint admins_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 40);

comment on column public.admins.display_name is
  'What the admin screens call this administrator. Null falls back to their email address.';

-- ============================================================
-- 20261016090000_operators_and_transmit_power.sql
-- ============================================================
-- Who runs a transmission, and how hard they push it.
--
-- An SSTV event is always somebody's: ARISS, the university that built the satellite, a club. That
-- is worth a table of its own rather than a string on each event, because the same organisation
-- comes back every time, and because a row is where a logo and a link can live.
--
-- `sstv_events.operator_id` is nullable for now so that the rows already in the catalogue stay
-- valid; the admin form requires it, and a later migration makes the column `not null` once the
-- existing events name theirs.

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  url text,
  logo_url text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.operators is
  'Organisations that run SSTV transmissions. Referenced by sstv_events.operator_id.';
comment on column public.operators.slug is
  'Stable, lowercase identifier published by the API, e.g. ariss. Safe in a URL.';
comment on column public.operators.logo_url is
  'Public URL of the logo in the sstv-images bucket, so an application can show it.';

alter table public.operators
  add constraint operators_slug_shape
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  add constraint operators_name_length
    check (char_length(name) between 1 and 80),
  add constraint operators_name_trimmed
    check (name = btrim(name)),
  add constraint operators_url_http
    check (url is null or (url ~ '^https?://' and char_length(url) <= 2000)),
  add constraint operators_logo_url_http
    check (logo_url is null or (logo_url ~ '^https?://' and char_length(logo_url) <= 2000));

alter table public.operators enable row level security;

create policy "Admins can read operators"
  on public.operators
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert operators"
  on public.operators
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update operators"
  on public.operators
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete operators"
  on public.operators
  for delete
  to authenticated
  using (public.is_admin());

-- `anon` holds nothing here either: the public API reads with the secret key.
revoke all on table public.operators from anon;
revoke truncate, references, trigger on table public.operators from authenticated;

create trigger operators_stamp_write
  before insert or update on public.operators
  for each row
  execute function public.stamp_write();

alter table public.sstv_events
  add column operator_id uuid references public.operators (id),
  add column transmit_power_watts numeric;

comment on column public.sstv_events.operator_id is
  'The organisation running this transmission.';
comment on column public.sstv_events.transmit_power_watts is
  'Downlink power in watts when the announcement gives it, e.g. 10 for the ISS.';

-- A watt is a positive number, and an amateur satellite does not run a kilowatt: anything above
-- that is a typed-in mistake rather than a transmitter.
alter table public.sstv_events
  add constraint sstv_events_transmit_power_range
    check (transmit_power_watts is null
           or (transmit_power_watts > 0 and transmit_power_watts <= 1000));

-- Serves both the join and "every event this operator has run".
create index sstv_events_operator_id_idx on public.sstv_events (operator_id);

-- ============================================================
-- 20261016100000_require_event_operator.sql
-- ============================================================
-- Every event names who runs it.
--
-- The column arrived nullable so the rows already in the catalogue stayed valid; they now name
-- theirs, so the rule moves from the form into the database. The admin is not the only writer: a
-- row inserted from the SQL editor or by a future importer has to carry an operator too, or the
-- API would serve an event nobody is answerable for.

alter table public.sstv_events
  alter column operator_id set not null;

-- ============================================================
-- 20261016120000_satellite_default_operator.sql
-- ============================================================
-- The operator a satellite's transmissions usually come from, so the admin does not retype it.
--
-- A default, not the answer. One satellite can carry more than one organisation's SSTV: the ISS
-- runs both ARISS's series and the Moscow Aviation Institute's MAI-75 from the Russian module, and
-- IO-86 has no SSTV transmitter at all Ã¢â‚¬â€ its images are uplinked from the ground through the FM
-- transponder by whoever is running that event. So the truth stays on `sstv_events.operator_id`,
-- which is what the API publishes, and this only decides what the form offers first.

alter table public.satellites
  add column default_operator_id uuid references public.operators (id) on delete set null;

comment on column public.satellites.default_operator_id is
  'Pre-selected in the event form. The event still carries its own operator, which may differ.';

-- ============================================================
-- 20261016140000_trim_all_whitespace.sql
-- ============================================================
-- `btrim(x)` with one argument trims spaces and nothing else, so every constraint written as
-- `x = btrim(x)` accepted a trailing tab, carriage return or newline. One got through: the public
-- API served `"UmKA-1\r\n"` as a satellite's alternate name.
--
-- The admin forms call `.trim()`, which does remove those, so only a row written outside the
-- application could carry one Ã¢â‚¬â€ which is exactly what these constraints exist to catch, and what
-- the comment on the older ones claimed they did.
--
-- The earlier constraints are left in place rather than replaced: they are implied by these, and
-- dropping one needs a confirmation the tooling here cannot give. `docs/database.md` carries the
-- statement that tidies them away.

update public.satellites
  set name = btrim(name, E' \t\r\n'),
      alternate_name = nullif(btrim(coalesce(alternate_name, ''), E' \t\r\n'), '')
  where name <> btrim(name, E' \t\r\n')
     or alternate_name is distinct from nullif(btrim(coalesce(alternate_name, ''), E' \t\r\n'), '');

update public.operators set name = btrim(name, E' \t\r\n')
  where name <> btrim(name, E' \t\r\n');

update public.admins
  set display_name = nullif(btrim(coalesce(display_name, ''), E' \t\r\n'), '')
  where display_name is distinct from nullif(btrim(coalesce(display_name, ''), E' \t\r\n'), '');

alter table public.satellites
  add constraint satellites_name_whitespace
    check (name = btrim(name, E' \t\r\n')),
  add constraint satellites_alternate_name_whitespace
    check (alternate_name is null or alternate_name = btrim(alternate_name, E' \t\r\n'));

alter table public.operators
  add constraint operators_name_whitespace
    check (name = btrim(name, E' \t\r\n'));

alter table public.admins
  add constraint admins_display_name_whitespace
    check (display_name is null or display_name = btrim(display_name, E' \t\r\n'));

-- An event's links are published by the API, so their scheme is the database's business.
--
-- `operators.url` and `operators.logo_url` have carried `^https?://` since the table was created.
-- `sstv_events.image_url` and `sstv_events.source_url` only had a length bound, even though they
-- are returned to every consumer of the catalogue. The admin forms run each URL through
-- `parseHttpUrl()`, so nothing in the application can write a `javascript:` or `data:` value Ã¢â‚¬â€ but
-- the reason these constraints exist, stated in the migration that added the first of them, is
-- that the application is not the only writer. A row inserted from the SQL editor or by a future
-- importer would have been republished verbatim, and the client that renders the link it was
-- handed is the one that pays for it.
--
-- Nothing is rewritten here. Every row the application wrote already matches, so if this fails,
-- the catalogue is holding a URL nobody can account for: that is worth a person looking rather
-- than a silent `update`.

alter table public.sstv_events
  add constraint sstv_events_image_url_http
    check (image_url is null or image_url ~ '^https?://'),
  add constraint sstv_events_source_url_http
    check (source_url is null or source_url ~ '^https?://');

-- ============================================================
-- 20261017080000_event_title.sql
-- ============================================================
-- What was stored as `description` is really the event's title: it is the headline the admin
-- screens and the API put in front of everything else. The API is still v1 and unpublished, so the
-- field is renamed everywhere rather than adding a second name for the same thing.
--
-- This runs before 20261017090000_public_read_views.sql, which selects the column as `title`.

alter table public.sstv_events rename column description to title;

alter table public.sstv_events rename constraint sstv_events_description_length to sstv_events_title_length;

comment on column public.sstv_events.title is
  'The title of the event, shown as the headline wherever the event is listed. Null when none was given.';

-- What the public API is allowed to publish, said in the database rather than in the code.
--
-- Every public read goes through the secret key, which bypasses Row Level Security, because `anon`
-- holds nothing on these tables and the publishable key that grants it is in the browser bundle
-- (see 20261015143436_restrict_public_reads.sql). That decision stands: the endpoint is the only
-- door. What it costs is that the blast radius of a mistake in the reading code is the whole
-- database -- `created_by`, `updated_by`, `admins`, the request counters. The only thing standing
-- in the way is a column list in src/lib/api/catalogue.ts and whoever reviews the next change to
-- it.
--
-- So the published columns become a thing with a name. These two views hold exactly what the API
-- returns and nothing else: `created_by` and `updated_by` are not in them, so no selection from
-- here can publish them, not even `select *`.
--
-- Flat rather than nested, with the joins done here. The API already assembles the nested JSON it
-- answers with, so this costs nothing in the response and means a reader of this file can see the
-- published shape in one place.
--
-- `security_invoker = true` matters: without it a view runs with its owner's privileges, which
-- would hand whoever holds SELECT a way past Row Level Security on the tables underneath. With it,
-- the view is exactly as privileged as whoever reads it.

create view public.public_events
  with (security_invoker = true)
  as select
    events.id,
    events.start_time,
    events.end_time,
    events.frequency,
    events.mode,
    events.transmit_power_watts,
    events.title,
    events.image_url,
    events.image_interval_seconds,
    events.source_url,
    events.cancelled_at,
    events.created_at,
    events.updated_at,
    satellites.norad_id as satellite_norad_id,
    satellites.name as satellite_name,
    satellites.alternate_name as satellite_alternate_name,
    operators.slug as operator_slug,
    operators.name as operator_name,
    operators.url as operator_url,
    operators.logo_url as operator_logo_url
  -- Inner joins, and they cannot lose a row: `norad_id` and `operator_id` are both `not null` and
  -- both foreign keys, so every event has exactly one of each. An assertion in supabase/tests
  -- checks the two row counts agree, so the day one of those columns becomes nullable, the build
  -- says so instead of the API quietly serving fewer events.
  from public.sstv_events as events
  join public.satellites as satellites on satellites.norad_id = events.norad_id
  join public.operators as operators on operators.id = events.operator_id;

comment on view public.public_events is
  'Exactly what GET /api/v1/events publishes. No created_by or updated_by: they are not here to be selected.';

create view public.public_satellites
  with (security_invoker = true)
  as select
    norad_id,
    name,
    alternate_name,
    created_at,
    updated_at
  from public.satellites;

comment on view public.public_satellites is
  'Exactly what GET /api/v1/satellites publishes. default_operator_id is a convenience for the admin and stays internal.';

-- Supabase's default privileges hand every new relation in `public` to all three API roles, and a
-- view is a relation: created and left alone, these two would be readable straight from PostgREST
-- with the publishable key, which is the door 20261015143436 closed. So every privilege on them is
-- written out here rather than inherited, the same way the function grants are.
--
-- `public_satellites` is a single-table view and therefore writable through, which is why the
-- secret key is given SELECT and nothing else: the only thing reading these is the public API, and
-- the public API reads.
revoke all on public.public_events from anon, authenticated, service_role;
revoke all on public.public_satellites from anon, authenticated, service_role;

grant select on public.public_events to service_role;
grant select on public.public_satellites to service_role;

-- How a client learns that an event is gone.
--
-- `?since=` reports everything that changed, except the one change it cannot: a row that is no
-- longer there has no `updated_at` to carry. A cancelled event keeps its row and gains
-- `cancelled_at`, which is the common case and already handled -- but an entry made in error is
-- deleted outright, and until now every client that had cached it kept it forever, with no request
-- it could make to find out. The documentation said a row that vanishes was a mistake; it did not
-- say how anyone was supposed to notice.
--
-- So a deletion leaves something behind. One row, two columns: which event, and when.
--
-- Not a soft delete. `deleted_at` on `sstv_events` would mean every read in the application has to
-- remember to exclude it, and the unique index on (norad_id, start_time, frequency) would refuse
-- the corrected entry that the deletion was making room for. A tombstone keeps the catalogue
-- exactly as it is and puts the record of the deletion somewhere it cannot be forgotten.

create table public.deleted_events (
  id uuid primary key,
  deleted_at timestamptz not null default now()
);

comment on table public.deleted_events is
  'One row per event deleted, so a client synchronising with ?since= can drop what it cached.';

-- What `?since=` scans, in the order the feed is paged in: `deleted_at` leading for the filter, `id`
-- behind it so the total order the endpoint sorts by needs no sort of its own. The same reasoning
-- as `sstv_events_start_time_id_idx`.
create index deleted_events_deleted_at_id_idx on public.deleted_events (deleted_at, id);

alter table public.deleted_events enable row level security;

-- No policies, and no grants: the public API reads this through a view with the secret key, and
-- nothing else has any business here. The row is written by the trigger below, not by a session.
revoke all on table public.deleted_events from anon, authenticated;

/**
 * Records the deletion of an event.
 *
 * `security definer` because the administrator deleting the event is `authenticated`, and that role
 * holds nothing on `deleted_events` -- deliberately, since a tombstone that the deleter can rewrite
 * is not a record of anything. The function therefore writes as its owner, with a pinned
 * `search_path` so that whoever calls it cannot decide which table is written to.
 *
 * `on conflict` because an id can come back: an importer that sets ids of its own could insert a
 * row that had been deleted, and deleting it again should move the date rather than fail.
 */
create function public.record_event_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deleted_events (id, deleted_at)
  values (old.id, now())
  on conflict (id) do update set deleted_at = now();

  return old;
end;
$$;

comment on function public.record_event_deletion() is
  'Writes the tombstone for a deleted event. Reached through its trigger; nobody needs EXECUTE.';

create trigger sstv_events_record_deletion
  after delete on public.sstv_events
  for each row
  execute function public.record_event_deletion();

-- A trigger function is fired by Postgres without asking whether the writer may call it by name,
-- so no role needs this one -- and a `security definer` function that anyone may call by name is
-- how a privilege escalation starts.
revoke all on function public.record_event_deletion() from public, anon, authenticated;

-- The published shape, the way `public_events` and `public_satellites` publish theirs.
--
-- `resource` is a constant today because events are the only thing with tombstones: satellites and
-- operators cannot be deleted while an event points at them, and the satellite catalogue is one
-- page a client can refetch whole. It is in the response from the start so that the day something
-- else gets a tombstone, this view becomes a union and no client that was already reading the feed
-- mistakes a satellite for an event.
create view public.public_deletions
  with (security_invoker = true)
  as select
    'event'::text as resource,
    id,
    deleted_at
  from public.deleted_events;

comment on view public.public_deletions is
  'Exactly what GET /api/v1/deletions publishes.';

revoke all on public.public_deletions from anon, authenticated, service_role;

grant select on public.public_deletions to service_role;

-- The organisations the API already names, made addressable.
--
-- Every event carries its operator nested -- slug, name, link, logo -- so a client can show whose
-- transmission it is. What it could not do was ask the other way round: list the organisations, or
-- resolve a slug it had seen without going back through an event. The data was published and not
-- reachable.
--
-- Same arrangement as `public_events` and `public_satellites`: exactly the published columns,
-- `security_invoker`, and the privileges written out rather than inherited. `created_by` and
-- `updated_by` are not here.

create view public.public_operators
  with (security_invoker = true)
  as select
    slug,
    name,
    url,
    logo_url,
    created_at,
    updated_at
  from public.operators;

comment on view public.public_operators is
  'Exactly what GET /api/v1/operators publishes. The id stays internal: the slug is the public identifier.';

revoke all on public.public_operators from anon, authenticated, service_role;

grant select on public.public_operators to service_role;

-- `?operator=` needs an index that leads with `operator_id`, and one that carries more than it.
--
-- `sstv_events_operator_id_idx` led with the right column and stopped there. The composite replaces
-- it because of the second query every list request runs: the exact `COUNT`, which filters on the
-- operator and usually on a time window too, and has no ordering to satisfy. Measured on a
-- nine-thousand-row catalogue, that count comes back as a bitmap index scan on
-- `(operator_id, start_time)` -- both conditions, from this index.
--
-- What it does not change is the page query itself. Asking for one operator's events in page order,
-- Postgres prefers to walk `(start_time, id)`, which is already in the order asked for, and discard
-- the rows belonging to other operators -- the limit stops it early, so for an operator holding a
-- fair share of the catalogue it reads a couple of hundred rows to return twenty. For an operator
-- holding almost none of it, that walk reads the whole index instead. At this catalogue's size it
-- is microseconds either way, and the fix when it stops being is keyset paging, which is already on
-- the roadmap, not a third index.
--
-- The single-column index is then only write cost: it leads with the same column as this one, which
-- is what makes it redundant rather than merely narrower. Same reasoning as
-- `20261015194000_drop_redundant_start_time_index.sql`.

create index sstv_events_operator_id_start_time_id_idx
  on public.sstv_events (operator_id, start_time, id);

drop index if exists public.sstv_events_operator_id_idx;

-- The one statement the baseline could not deliver.
--
-- `sstv_events_start_time_idx` answers nothing that `(start_time, id)` does not, and the squashed
-- baseline drops it -- in a section carrying the name of the migration that first did,
-- `20261015194000_drop_redundant_start_time_index.sql`. A database built from these files therefore
-- never has the index.
--
-- The hosted project still did. Marking the baseline applied with `supabase migration repair`,
-- which is what the squash made necessary, records it without running it: every statement that
-- existed only inside the baseline never reached a project that predates it. This was the only one.
--
-- So it is repeated here as a migration of its own, which is the only way the repository stays the
-- thing that decides. `if exists` makes it a no-op everywhere the baseline already ran.

drop index if exists public.sstv_events_start_time_idx;

-- `sstv_events_norad_id_idx` is the third index in this schema made redundant by a wider one.
--
-- `sstv_events_no_duplicate_idx` is unique on `(norad_id, start_time, frequency)` and therefore
-- leads with the same column, which is all a lookup by satellite needs: measured on a
-- nine-thousand-row catalogue, the exact `COUNT` behind `?norad_id=` comes back as a bitmap index
-- scan on `sstv_events_norad_id_idx` while it exists and on `sstv_events_no_duplicate_idx` once it
-- does not -- the same plan, one fewer index to write to on every insert. The page query uses
-- `(start_time, id)` either way, since that is the order it was asked for.
--
-- Same reasoning as `20261015194000_drop_redundant_start_time_index.sql` and
-- `20261017120000_operator_page_index.sql`. It is the last of them: every remaining index on this
-- table either leads with a column no other one does, or is the primary key.

drop index if exists public.sstv_events_norad_id_idx;

-- An event is not deleted from the admin any more, so the privilege goes with the button.
--
-- The two acts were always different, and the admin said so in its own confirmation text: `Cancel`
-- marks a transmission that was announced and did not happen, keeping the row and setting
-- `cancelled_at` so that everyone who cached it finds out; `Delete` removed the row outright, for
-- an entry that should never have been published at all.
--
-- The second one is now rare enough not to deserve a button next to the first: the realistic use of
-- it was a mistake, and the realistic cost of it was a curator reaching for the red button at the
-- end of a long evening. The screen offers Edit, Cancel and Reinstate, which is the whole of what
-- curating a catalogue of announcements needs.
--
-- Taking the button away is not the same as taking the capability away. An administrator's session
-- can speak to PostgREST directly, and `anon` holds nothing only because this schema says so --
-- which is the same reasoning as `20261015193000_restrict_function_execution.sql`: a privilege that
-- is never meant to be used should not be granted. So the policy goes, and the grant with it, which
-- is what turns a delete from a silent no-op -- Row Level Security refuses rows, not statements --
-- into `42501 permission denied`.
--
-- What remains able to delete an event is the secret key, from the SQL editor: the owner's
-- deliberate act, on a row nobody should have to live with. `deleted_events` and its trigger stay
-- exactly for that case. They were written for the application's own deletions and now cover the
-- only ones left -- the ones no policy and no code review stand in front of, which is precisely
-- where this schema has always assumed the next writer would come from.
--
-- Note that such a deletion leaves the event's image in the `sstv-images` bucket: the cleanup lived
-- in the server action that is gone. One orphaned file, on the rarest path there is, is a better
-- trade than keeping a delete button to tidy up after.

drop policy "Admins can delete sstv_events" on public.sstv_events;

revoke delete on table public.sstv_events from authenticated;

-- ============================================================
-- 20261017160000_admin_avatar.sql
-- ============================================================
-- A profile photo for each administrator, shown next to their name on the admin screens.
--
-- Nullable: an administrator who has not chosen one is rendered as a placeholder, the same way an
-- operator without a logo is. The URL points into the public `sstv-images` bucket, which is what
-- `storagePathFromPublicUrl` already validates before any delete.

alter table public.admins
  add column avatar_url text;

alter table public.admins
  add constraint admins_avatar_url_http
    check (avatar_url is null or (avatar_url ~ '^https?://' and char_length(avatar_url) <= 2000));

comment on column public.admins.avatar_url is
  'Public URL of the administrator''s profile photo in the sstv-images bucket. Null shows a placeholder.';

-- ============================================================
-- 20261017170000_satellite_last_event.sql
-- ============================================================
-- The values an event most recently used for each satellite, so the event form can prefill
-- frequency, mode and image interval when an administrator chooses a satellite.
--
-- "Most recent" means the event with the latest start time that has already begun. A future,
-- scheduled event is a plan rather than something that has been used.

create or replace function public.latest_event_for_satellite()
returns table (
  norad_id integer,
  frequency numeric(10,4),
  mode public.sstv_mode,
  image_interval_seconds integer
)
language sql
stable
as $$
  select distinct on (e.norad_id)
         e.norad_id,
         e.frequency,
         e.mode,
         e.image_interval_seconds
    from public.sstv_events e
   where e.start_time <= now()
   order by e.norad_id, e.start_time desc, e.id desc;
$$;

-- Supabase grants EXECUTE to `anon` and `authenticated` on every new function by default. The
-- schema convention is to take that back and grant only who needs it: administrators read through
-- `authenticated`, and the secret key keeps its usual role.
revoke all on function public.latest_event_for_satellite() from public, anon;
grant execute on function public.latest_event_for_satellite() to authenticated, service_role;

alter function public.latest_event_for_satellite() set search_path = '';

-- ============================================================
-- 20261017180000_credits.sql
-- ============================================================
-- The public credits page: which administrators show up as data feeders, and the apps that use the
-- data. Feeders opt in rather than being listed automatically; a name belongs to a person, and that
-- person decides whether it is put on a public page. The app users are their own table because they
-- are a different thing from the operators whose transmissions the catalogue describes.

alter table public.admins
  add column shown_on_credits boolean not null default false;

comment on column public.admins.shown_on_credits is
  'Whether this administrator is listed as a data feeder on the public credits page.';

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  logo_url text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.app_users is
  'Apps and sites that use the BackToSSTV data, shown on the public credits page.';
comment on column public.app_users.url is
  'The official website, linked from the credits page.';
comment on column public.app_users.logo_url is
  'Public URL of the logo in the sstv-images bucket, so the credits page can show it.';

alter table public.app_users
  add constraint app_users_name_length
    check (char_length(name) between 1 and 80),
  add constraint app_users_name_trimmed
    check (name = btrim(name)),
  add constraint app_users_name_whitespace
    check (name = btrim(name, E' \t\r\n')),
  add constraint app_users_url_http
    check (url is null or (url ~ '^https?://' and char_length(url) <= 2000)),
  add constraint app_users_logo_url_http
    check (logo_url is null or (logo_url ~ '^https?://' and char_length(logo_url) <= 2000));

alter table public.app_users enable row level security;

create policy "Admins can read app_users"
  on public.app_users
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert app_users"
  on public.app_users
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update app_users"
  on public.app_users
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete app_users"
  on public.app_users
  for delete
  to authenticated
  using (public.is_admin());

-- The public site reads through the secret key with a fixed column list; `anon` holds nothing here.
revoke all on table public.app_users from anon;
revoke truncate, references, trigger on table public.app_users from authenticated;

create trigger app_users_stamp_write
  before insert or update on public.app_users
  for each row
  execute function public.stamp_write();

-- ============================================================
-- 20261017190000_event_title_view.sql
-- ============================================================
-- The hosted project applied 20261017090000_public_read_views.sql while the event column was still
-- called `description`, so its `public_events` view exposes that name. 20261017080000_event_title.sql
-- renames the column to `title`, which updates the view's definition but not its output column name.
-- `create or replace view` refuses to change column names, so this renames just that output column.
-- On a database built from scratch the view is already called `title`, so the statement is a no-op.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_events'
      and column_name = 'description'
  ) then
    alter view public.public_events rename column description to title;
  end if;
end
$$;

create view public.public_credit_feeders
  with (security_invoker = true)
  as select
    display_name,
    avatar_url
  from public.admins
  where shown_on_credits;

comment on view public.public_credit_feeders is
  'Exactly what the credits page shows of an administrator who opted in. No account id, by design.';

create view public.public_credit_apps
  with (security_invoker = true)
  as select
    id,
    name,
    url,
    logo_url
  from public.app_users;

comment on view public.public_credit_apps is
  'Exactly what the credits page shows of an app using the data.';

-- Supabase hands every new relation in `public` to all three API roles, and a view is a relation:
-- left alone, these two would be readable straight from PostgREST with the publishable key.
revoke all on public.public_credit_feeders from anon, authenticated, service_role;
revoke all on public.public_credit_apps from anon, authenticated, service_role;

grant select on public.public_credit_feeders to service_role;
grant select on public.public_credit_apps to service_role;
