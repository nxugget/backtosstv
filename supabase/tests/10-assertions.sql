-- What the schema must guarantee, asserted against a database built from the migrations.
--
-- The policies are the only thing between the publishable key and the catalogue, and the
-- constraints the only thing between a careless writer and a catalogue nobody should cite. Both are
-- claims this file either proves or breaks the build over.
--
-- The first failure aborts, and says what the database actually answered: in CI that is the line to
-- go and fix.

\set ON_ERROR_STOP on

create schema tests;

create function tests.ok(condition boolean, description text) returns void
language plpgsql as $$
begin
  if condition then
    raise notice 'ok    %', description;
  else
    raise exception 'FAILED: %', description;
  end if;
end;
$$;

-- A statement that must be refused, with the code it must be refused with.
create function tests.refused(statement text, expected_sqlstate text, description text)
returns void
language plpgsql as $$
declare
  actual text;
  reason text;
begin
  begin
    execute statement;
    actual := null;
  exception
    when others then
      actual := sqlstate;
      reason := sqlerrm;
  end;

  if actual = expected_sqlstate then
    raise notice 'ok    %', description;
  elsif actual is null then
    raise exception 'FAILED: % (accepted, expected refusal %)', description, expected_sqlstate;
  else
    raise exception 'FAILED: % (refused with % "%", expected %)',
      description, actual, reason, expected_sqlstate;
  end if;
end;
$$;

-- A statement that must go through.
create function tests.accepted(statement text, description text) returns void
language plpgsql as $$
begin
  execute statement;
  raise notice 'ok    %', description;
exception
  when others then
    raise exception 'FAILED: % (refused with %: %)', description, sqlstate, sqlerrm;
end;
$$;

create function tests.becomes(user_id uuid, role_name text) returns void
language plpgsql as $$
begin
  execute format('set local role %I', role_name);
  perform set_config(
    'request.jwt.claims',
    case when user_id is null then '{}' else json_build_object('sub', user_id)::text end,
    true);
end;
$$;

-- The assertions run as the roles they are about, so those roles have to be able to call them.
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- Two accounts: one listed in admins and holding the owner flag, one signed in but not an
-- administrator. In production only the invite flow can create either; here the owner of the
-- database stands in for it.
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'stranger@example.test');

insert into public.admins (user_id, is_owner)
values ('11111111-1111-4111-8111-111111111111', true);

insert into public.satellites (norad_id, name, alternate_name)
values (25544, 'ISS', 'ZARYA');

insert into public.operators (id, slug, name)
values ('33333333-3333-4333-8333-333333333333', 'ariss', 'ARISS');

insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, source_url)
values (
  '33333333-3333-4333-8333-333333333333',
  25544,
  '2026-09-14T09:12:00Z',
  '2026-09-14T09:24:00Z',
  145.8,
  'PD120',
  'https://www.ariss.org/'
);


-- The anonymous role. This is what the publishable key grants, and that key is in the browser
-- bundle, so everything below is reachable by anyone who views source.

begin;
select tests.becomes(null, 'anon');

select tests.ok(
  (select count(*) from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public') = 0,
  'anon holds no privilege at all on the public schema');

select tests.refused('select * from public.sstv_events', '42501',
  'anon cannot read sstv_events');

select tests.refused('select * from public.satellites', '42501',
  'anon cannot read satellites');

select tests.refused('select * from public.admins', '42501',
  'anon cannot read admins');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, now(), now() + interval '1 hour', 145.8, 'PD120')$$,
  '42501', 'anon cannot write sstv_events');

select tests.refused('truncate public.sstv_events', '42501',
  'anon cannot truncate sstv_events, which Row Level Security alone would not have stopped');
rollback;


-- A signed-in account that is not an administrator. Getting there requires an account, which only
-- the owner can create, but no policy may depend on that.

begin;
select tests.becomes('22222222-2222-4222-8222-222222222222', 'authenticated');

select tests.ok((select count(*) from public.sstv_events) = 0,
  'a non-admin session sees no events');

select tests.ok((select count(*) from public.satellites) = 0,
  'a non-admin session sees no satellites');

select tests.ok((select count(*) from public.admins) = 0,
  'a non-admin session sees no admins row');

select tests.refused(
  $$insert into public.satellites (norad_id, name) values (99999, 'NOPE')$$,
  '42501', 'a non-admin session cannot add a satellite');

select tests.refused(
  $$insert into public.admins (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  '42501', 'a non-admin session cannot make itself an administrator');
rollback;


-- The administrator session the admin screens run as.

begin;
select tests.becomes('11111111-1111-4111-8111-111111111111', 'authenticated');

select tests.ok((select count(*) from public.sstv_events) = 1, 'an admin session reads events');
select tests.ok((select count(*) from public.satellites) = 1, 'an admin session reads satellites');
select tests.ok((select count(*) from public.admins) = 1, 'an admin session reads its own row');

select tests.accepted(
  $$insert into public.satellites (norad_id, name) values (40931, 'LAPANA2')$$,
  'an admin session adds a satellite');

select tests.accepted(
  $$update public.sstv_events set title = 'edited'$$,
  'an admin session edits an event');

select tests.refused(
  $$insert into public.admins (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  '42501', 'even an admin session cannot write admins: only the invite flow can');
rollback;


-- The owner flag. The access model is the rows of admins, so the right to add one belongs to a
-- single account.

begin;
select tests.becomes(null, 'postgres');
select tests.refused(
  $$insert into public.admins (user_id, is_owner)
    values ('22222222-2222-4222-8222-222222222222', true)$$,
  '23505', 'a second owner is impossible');

select tests.accepted(
  $$insert into public.admins (user_id, is_owner)
    values ('22222222-2222-4222-8222-222222222222', false)$$,
  'a second administrator who is not the owner is fine');
rollback;


-- Whitespace that is not a space. `btrim(x)` alone trims spaces only, so the constraints written
-- that way let a pasted carriage return through, and one reached the public API.

begin;
select tests.becomes(null, 'postgres');
select tests.refused(
  $$update public.satellites set alternate_name = E'UmKA-1\r\n' where norad_id = 25544$$,
  '23514', 'an alternate name with a trailing CRLF is refused');

select tests.refused(
  $$update public.satellites set name = E'ISS\t' where norad_id = 25544$$,
  '23514', 'a name with a trailing tab is refused');

select tests.refused(
  $$insert into public.operators (slug, name) values ('crlf', E'ARISS\n')$$,
  '23514', 'an operator name with a trailing newline is refused');

select tests.refused(
  $$update public.admins set display_name = E'Owner\r'
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', 'an administrator name with a trailing carriage return is refused');
rollback;


-- The administrator's display name, which is what the admin screens put next to a curated row.

begin;
select tests.becomes(null, 'postgres');
select tests.accepted(
  $$update public.admins set display_name = 'Owner'
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'an administrator can be given a name');

select tests.refused(
  $$update public.admins set display_name = '  padded  '
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', 'a name with surrounding whitespace is refused');

select tests.refused(
  $$update public.admins set display_name = repeat('n', 41)
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', 'a name longer than the forms allow is refused');

select tests.accepted(
  $$update public.admins set display_name = null
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'and the name can be cleared again, falling back to the email address');
rollback;


-- The bounds. The application is not the only writer: a row inserted from the SQL editor or by a
-- future importer has to be as trustworthy as one typed into the admin.

begin;
select tests.becomes(null, 'postgres');
select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-09-14T10:00:00Z', '2026-09-14T09:00:00Z', 145.8, 'PD120')$$,
  '23514', 'an event cannot end before it starts');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 145.8, 'PD120')$$,
  '23514', 'an event cannot be instantaneous');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-09-14T10:00:00Z', '2027-09-14T10:00:00Z', 145.8, 'PD120')$$,
  '23514', 'an event cannot run for a year, which is a mistyped date');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 0, 'PD120')$$,
  '23514', 'a frequency of zero is refused');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 200000, 'PD120')$$,
  '23514', 'a frequency past any amateur band is refused');

select tests.refused(
  $$insert into public.sstv_events
      (operator_id, norad_id, start_time, end_time, frequency, mode, image_interval_seconds)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 145.8, 'PD120', 0)$$,
  '23514', 'an image interval of zero is refused');

select tests.refused(
  $$insert into public.sstv_events
      (operator_id, norad_id, start_time, end_time, frequency, mode, image_interval_seconds)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 145.8, 'PD120', 90000)$$,
  '23514', 'an image interval longer than a day is refused');

select tests.refused(
  format($$insert into public.sstv_events
      (operator_id, norad_id, start_time, end_time, frequency, mode, title)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 145.8, 'PD120', %L)$$,
    repeat('x', 2001)),
  '23514', 'a title past 2000 characters is refused');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', 145.8, 'Not a mode')$$,
  '22P02', 'a mode outside the enum is refused');

select tests.refused(
  $$insert into public.satellites (norad_id, name) values (12345, ' ISS ')$$,
  '23514', 'an untrimmed satellite name is refused, so " ISS" and "ISS" cannot both exist');

select tests.refused(
  format($$insert into public.satellites (norad_id, name) values (12345, %L)$$, repeat('x', 81)),
  '23514', 'a satellite name past 80 characters is refused');

select tests.refused(
  $$insert into public.satellites (norad_id, name) values (0, 'ZERO')$$,
  '23514', 'a NORAD number of zero is refused');
rollback;


-- The duplicate guard. Two people watching the same announcement will eventually enter it twice.

begin;
select tests.becomes(null, 'postgres');
select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-09-14T09:12:00Z', '2026-09-14T09:30:00Z', 145.8, 'PD120')$$,
  '23505', 'the same satellite, start and frequency cannot be published twice');

select tests.accepted(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-09-14T09:12:00Z', '2026-09-14T09:30:00Z', 437.8, 'PD120')$$,
  'the same satellite and start on another frequency is a different event');
rollback;


-- The referential guard behind the admin's "that satellite has events" message.

begin;
select tests.becomes(null, 'postgres');
select tests.refused('delete from public.satellites where norad_id = 25544', '23503',
  'a satellite with events cannot be deleted');
rollback;


-- The audit trail, which an administrator may not forge even though they may write every column.

begin;
select tests.becomes('11111111-1111-4111-8111-111111111111', 'authenticated');

insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
values ('33333333-3333-4333-8333-333333333333', 25544, '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', 145.9, 'PD180');

select tests.ok(
  (select created_by from public.sstv_events where frequency = 145.9)
    = '11111111-1111-4111-8111-111111111111',
  'an insert records which administrator published the event');

select tests.ok(
  (select created_at is not null and updated_at is not null
   from public.sstv_events where frequency = 145.9),
  'an insert stamps both timestamps');

update public.sstv_events
set title = 'edited',
    created_at = '2000-01-01T00:00:00Z',
    created_by = '22222222-2222-4222-8222-222222222222',
    updated_at = '2000-01-01T00:00:00Z'
where frequency = 145.9;

select tests.ok(
  (select created_by from public.sstv_events where frequency = 145.9)
    = '11111111-1111-4111-8111-111111111111',
  'an update cannot rewrite who created the row');

select tests.ok(
  (select created_at from public.sstv_events where frequency = 145.9) > '2020-01-01T00:00:00Z',
  'an update cannot rewrite when the row was created');

select tests.ok(
  (select updated_at from public.sstv_events where frequency = 145.9) > '2020-01-01T00:00:00Z',
  'an update cannot backdate updated_at, which clients synchronise on');

select tests.ok(
  (select updated_by from public.sstv_events where frequency = 145.9)
    = '11111111-1111-4111-8111-111111111111',
  'an update records who changed the row');
rollback;


-- Cancelling, which is what a consumer needs instead of a row that simply disappears.

begin;
select tests.becomes('11111111-1111-4111-8111-111111111111', 'authenticated');

update public.sstv_events set cancelled_at = now() where norad_id = 25544;

select tests.ok((select count(*) from public.sstv_events where cancelled_at is not null) = 1,
  'a cancelled event keeps its row');
rollback;


-- The request budget's counters, which only the API may touch and only through its function.

begin;
select tests.becomes(null, 'anon');

select tests.refused('select * from public.api_request_counters', '42501',
  'anon cannot read the request counters');

select tests.refused($$select public.count_api_request('198.51.100.1', 60)$$, '42501',
  'anon cannot count requests on its own behalf');
rollback;

begin;
select tests.becomes('22222222-2222-4222-8222-222222222222', 'authenticated');

select tests.refused('select * from public.api_request_counters', '42501',
  'a signed-in session cannot read the request counters either');

select tests.refused($$select public.count_api_request('198.51.100.1', 60)$$, '42501',
  'a signed-in session cannot count requests');
rollback;

begin;
select tests.ok(
  (select public.count_api_request('198.51.100.1', 60)) = 1
    and (select public.count_api_request('198.51.100.1', 60)) = 2
    and (select public.count_api_request('198.51.100.1', 60)) = 3,
  'counting a caller returns its running total for the window');

select tests.ok((select public.count_api_request('203.0.113.9', 60)) = 1,
  'another caller starts from its own total');

select tests.ok((select count(*) from public.api_request_counters) = 2,
  'the table holds one row per caller, not one per window');

-- A window that has passed starts the count again, without anything having reset it.
update public.api_request_counters
set window_started_at = clock_timestamp() - interval '2 hours'
where client = '198.51.100.1';

select tests.ok((select public.count_api_request('198.51.100.1', 60)) = 1,
  'a caller whose window has passed is counted as its first request again');
rollback;


-- The views the public API reads, which are what the published columns are made of.
--
-- The reads go through the secret key, so nothing below is about Row Level Security: it is about
-- the columns being out of reach in the first place, and about the views not having quietly handed
-- the catalogue back to the publishable key.

-- `id` is not on this list: an event publishes its own, and a tombstone is nothing but one. What
-- must never appear is who typed the row, and the internal keys the slug and the NORAD number
-- exist to replace.
select tests.ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name in ('public_events', 'public_satellites', 'public_operators', 'public_deletions')
     and column_name in ('created_by', 'updated_by', 'operator_id', 'default_operator_id')) = 0,
  'the public views hold no internal column, so no selection from them can publish one');

select tests.ok(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'public_operators')
    = array['created_at', 'logo_url', 'name', 'slug', 'updated_at', 'url'],
  'public_operators holds exactly the columns the API publishes');

select tests.ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class
   where relnamespace = 'public'::regnamespace and relname = 'public_operators'),
  'public_operators runs with the privileges of whoever reads it');

select tests.ok(
  (select count(*) from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and table_schema = 'public' and table_name = 'public_operators') = 0,
  'and the publishable key gains nothing from it either');

select tests.ok(
  (select count(*) from public.public_operators) = (select count(*) from public.operators),
  'public_operators loses no operator');


-- The credits page, which is public output and therefore reads views too.

select tests.ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name in ('public_credit_feeders', 'public_credit_apps')
     and column_name in ('user_id', 'is_owner', 'created_by', 'updated_by', 'shown_on_credits')) = 0,
  'the credits views hold no account id and nothing internal');

select tests.ok(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'public_credit_feeders')
    = array['avatar_url', 'display_name'],
  'a feeder is a name and a photo, which is what they opted into');

select tests.ok(
  (select bool_and('security_invoker=true' = any (reloptions)) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'v'
     and relname in ('public_credit_feeders', 'public_credit_apps')),
  'both credits views run with the privileges of whoever reads them');

select tests.ok(
  (select count(*) from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and table_schema = 'public'
     and table_name in ('public_credit_feeders', 'public_credit_apps')) = 0,
  'and the publishable key gains nothing from them');

-- The consent rule lives in the view, not in whoever remembers to filter.
begin;
select tests.becomes(null, 'postgres');

update public.admins set shown_on_credits = false;

select tests.ok(
  (select count(*) from public.public_credit_feeders) = 0,
  'an administrator who has not opted in cannot be listed at all');

update public.admins set shown_on_credits = true
where user_id = '11111111-1111-4111-8111-111111111111';

select tests.ok(
  (select count(*) from public.public_credit_feeders) = 1,
  'and appears once they have');
rollback;

select tests.ok(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'public_events') = array[
    'cancelled_at', 'created_at', 'end_time', 'frequency', 'id',
    'image_interval_seconds', 'image_url', 'mode', 'operator_logo_url', 'operator_name',
    'operator_slug', 'operator_url', 'satellite_alternate_name', 'satellite_name',
    'satellite_norad_id', 'source_url', 'start_time', 'title', 'transmit_power_watts',
    'updated_at'
  ],
  'public_events holds exactly the columns the API publishes');

select tests.ok(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'public_satellites') = array[
    'alternate_name', 'created_at', 'name', 'norad_id', 'updated_at'
  ],
  'public_satellites holds exactly the columns the API publishes');

-- Without `security_invoker`, a view runs with its owner's privileges, which would hand whoever
-- holds SELECT a way past Row Level Security on the tables underneath.
select tests.ok(
  (select bool_and('security_invoker=true' = any (reloptions))
   from pg_class
   where relnamespace = 'public'::regnamespace
     and relkind = 'v'
     and relname in ('public_events', 'public_satellites')),
  'both public views run with the privileges of whoever reads them');

select tests.ok(
  (select count(*) from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and table_schema = 'public'
     and table_name in ('public_events', 'public_satellites')) = 0,
  'the publishable key gains nothing from the views existing');

select tests.ok(
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
   from information_schema.role_table_grants
   where grantee = 'service_role'
     and table_schema = 'public'
     and table_name in ('public_events', 'public_satellites')) = array['SELECT'],
  'the secret key may read the views and nothing else, since reading is all the API does');

-- The views inner-join on two `not null` foreign keys, so they cannot drop an event. The day one of
-- those columns becomes nullable, this fails instead of the API quietly serving fewer events.
select tests.ok(
  (select count(*) from public.public_events) = (select count(*) from public.sstv_events),
  'public_events loses no event to its joins');

select tests.ok(
  (select count(*) from public.public_satellites) = (select count(*) from public.satellites),
  'public_satellites loses no satellite');

begin;
select tests.becomes(null, 'anon');

select tests.refused('select * from public.public_events', '42501',
  'anon cannot read the events view either');

select tests.refused('select * from public.public_satellites', '42501',
  'anon cannot read the satellites view either');
rollback;

begin;
select tests.becomes('11111111-1111-4111-8111-111111111111', 'authenticated');

-- The admin screens read the tables with the administrator's own session; nothing in the
-- application reads these views except the API, with the secret key.
select tests.refused('select * from public.public_events', '42501',
  'even an administrator session has no business in the public views');
rollback;


-- Tombstones. The one change `?since=` cannot report on its own is a row that is no longer there,
-- so a deletion has to leave something behind -- written by a trigger, out of reach of the session
-- that did the deleting.

select tests.ok(
  (select count(*) from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and table_schema = 'public'
     and table_name in ('deleted_events', 'public_deletions')) = 0,
  'neither key reaches the tombstones or their view');

select tests.ok(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'public_deletions')
    = array['deleted_at', 'id', 'resource'],
  'public_deletions holds exactly the columns the API publishes');

select tests.ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class
   where relnamespace = 'public'::regnamespace and relname = 'public_deletions'),
  'public_deletions runs with the privileges of whoever reads it');

select tests.ok(
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
   from information_schema.role_table_grants
   where grantee = 'service_role'
     and table_schema = 'public'
     and table_name = 'public_deletions') = array['SELECT'],
  'the secret key may read the deletions feed and nothing else');

-- A `security definer` function anyone may call by name is how a privilege escalation starts. This
-- one is reached only through its trigger, which Postgres fires without asking.
select tests.ok(
  (select count(*) from information_schema.role_routine_grants
   where grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_schema = 'public'
     and routine_name = 'record_event_deletion') = 0,
  'nobody may call the tombstone writer by name');

select tests.ok(
  (select count(*) from pg_index
   join pg_class on pg_class.oid = pg_index.indexrelid
   where pg_index.indrelid = 'public.deleted_events'::regclass
     and pg_class.relname = 'deleted_events_deleted_at_id_idx') = 1,
  'the order the deletions feed pages in is indexed, so it needs no sort');

begin;
select tests.becomes(null, 'anon');

select tests.refused('select * from public.deleted_events', '42501',
  'anon cannot read the tombstones');

select tests.refused('select * from public.public_deletions', '42501',
  'anon cannot read the deletions feed');
rollback;

-- Deleting an event is not something the application does. The privilege went with the button, so
-- the statement is refused outright rather than quietly affecting no rows -- which is what revoking
-- the grant buys over leaving Row Level Security to it, since policies refuse rows, not statements.
begin;
select tests.becomes('11111111-1111-4111-8111-111111111111', 'authenticated');

select tests.refused('select * from public.deleted_events', '42501',
  'an administrator cannot read the tombstones');

select tests.refused(
  $$insert into public.deleted_events (id) values ('44444444-4444-4444-8444-444444444444')$$,
  '42501', 'nor write one by hand: a tombstone its own deleter can forge records nothing');

select tests.refused(
  $$delete from public.sstv_events where id = (select id from public.sstv_events limit 1)$$,
  '42501', 'and cannot delete an event at all, which is what removing the button has to mean');
rollback;

-- What remains able to delete one is the secret key, from the SQL editor: a deliberate act on a row
-- that should never have been published. That act is the whole reason the tombstones exist, since
-- no policy and no code review stands in front of it.
begin;
select tests.becomes(null, 'postgres');

delete from public.sstv_events
where id = (select id from public.sstv_events order by start_time limit 1);

select tests.ok(
  (select count(*) from public.deleted_events) = 1,
  'a deletion made outside the application still leaves a tombstone behind');

select tests.ok(
  (select count(*) from public.public_deletions where resource = 'event') = 1,
  'and the deletions feed publishes it');
rollback;


-- Row Level Security itself. Policies on a table that does not enforce them are decoration, and
-- `create table` does not enable it.

select tests.ok(
  (select bool_and(relrowsecurity) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'),
  'every table in the public schema enforces Row Level Security');


-- The operators table, which carries who runs a transmission and the logo to show for them.

begin;
select tests.becomes(null, 'postgres');

-- `ariss` is the operator every event above points at, so this is the real collision.
select tests.refused(
  $$insert into public.operators (slug, name) values ('ariss', 'ARISS again')$$,
  '23505', 'two operators cannot share a slug');

select tests.refused(
  $$insert into public.operators (slug, name) values ('Not A Slug', 'Nope')$$,
  '23514', 'a slug with capitals or spaces is refused');

select tests.refused(
  $$insert into public.operators (slug, name, url) values ('x', 'Too short', null)$$,
  '23514', 'a one-character slug is refused');

select tests.refused(
  $$insert into public.operators (slug, name, url) values ('ftp-op', 'Bad link', 'ftp://example.test')$$,
  '23514', 'a link that is not http is refused');

select tests.refused(
  $$insert into public.operators (slug, name) values ('padded', '  ARISS  ')$$,
  '23514', 'an untrimmed name is refused');
rollback;


-- An event's own links, which the API hands to every consumer. The admin forms already refuse
-- anything that is not http(s); these are what makes that true of a row written anywhere else.

begin;
select tests.becomes(null, 'postgres');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, source_url)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 145.8, 'PD120', 'javascript:alert(1)')$$,
  '23514', 'a source link that is not http is refused');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, image_url)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z', 145.8, 'PD120', 'data:text/html;base64,PHNjcmlwdD4=')$$,
  '23514', 'an image link that is not http is refused');

select tests.accepted(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, source_url, image_url)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z', 145.8, 'PD120', 'https://www.ariss.org/', 'https://example.test/sstv.jpg')$$,
  'http links are accepted on both');
rollback;


-- The transmitter power an announcement sometimes gives.

begin;
select tests.becomes(null, 'postgres');
select tests.accepted(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, transmit_power_watts)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', 145.8, 'PD120', 10)$$,
  'an event can record its transmitter power');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, transmit_power_watts)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', 145.8, 'PD120', 0)$$,
  '23514', 'zero watts is refused');

select tests.refused(
  $$insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode, transmit_power_watts)
    values ('33333333-3333-4333-8333-333333333333', 25544, '2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z', 145.8, 'PD120', 5000)$$,
  '23514', 'a kilowatt and more is a typo, not a transmitter');
rollback;


-- An operator cannot be removed while events still point at it.

begin;
select tests.becomes(null, 'postgres');
insert into public.sstv_events (operator_id, norad_id, start_time, end_time, frequency, mode)
  values ('33333333-3333-4333-8333-333333333333', 25544, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 145.8, 'PD120');

select tests.refused(
  $$delete from public.operators where slug = 'ariss'$$,
  '23503', 'an operator with events cannot be deleted');
rollback;


begin;
select tests.becomes(null, 'postgres');
select tests.refused(
  $$insert into public.sstv_events (norad_id, start_time, end_time, frequency, mode)
    values (25544, '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z', 145.8, 'PD120')$$,
  '23502', 'an event without an operator is refused, whoever is writing it');
rollback;


-- A satellite's usual operator is a convenience, not a commitment: unlike an event, it gives way
-- when the operator is removed rather than holding the row hostage.

begin;
select tests.becomes(null, 'postgres');
update public.satellites set default_operator_id = '33333333-3333-4333-8333-333333333333' where norad_id = 25544;

select tests.refused(
  $$delete from public.operators where slug = 'ariss'$$,
  '23503', 'the events pointing at it still refuse the delete');

delete from public.sstv_events;
select tests.accepted(
  $$delete from public.operators where slug = 'ariss'$$,
  'with no events left, removing the operator is allowed');

select tests.ok(
  (select default_operator_id from public.satellites where norad_id = 25544) is null,
  'and the satellite simply loses its usual operator');
rollback;


-- Who may call what. Supabase's default privileges hand EXECUTE on every new function in this
-- schema to the API roles, so each of these is something a migration took back, and the schema
-- tests are the only thing that would notice if one stopped doing so.

select tests.ok(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', oid, 'execute')) = 0,
  'anon can call no function in the public schema');

select tests.ok(
  has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
  'authenticated can call is_admin(), which every policy expression needs');

select tests.ok(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', oid, 'execute'))
  = array['is_admin', 'latest_event_for_satellite'],
  'and nothing else');

select tests.ok(
  has_function_privilege('service_role', 'public.count_api_request(text, integer)', 'execute'),
  'the secret key can count a request against the budget');

-- An unpinned search path lets whoever sets it decide which table a function's unqualified names
-- resolve to.
select tests.ok(
  (select bool_and(proconfig @> array['search_path=""']) from pg_proc
   where pronamespace = 'public'::regnamespace),
  'every function in the public schema pins its search path');


-- The indexes the API's ordering and filters depend on.

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_start_time_id_idx') = 1,
  'the composite order the API pages by is indexed');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_updated_at_idx') = 1,
  'incremental synchronisation is indexed');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname = 'sstv_events_operator_id_start_time_id_idx') = 1,
  'an operator''s events are indexed with the page order behind them, which the exact count uses');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_operator_id_idx') = 0,
  'and the narrower index it replaces is gone');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_no_duplicate_idx') = 1,
  'the unique index that also serves a lookup by satellite is there');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_norad_id_idx') = 0,
  'so the single-column index on norad_id is gone too');

select tests.ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sstv_events_start_time_idx') = 0,
  'the index made redundant by the composite one is gone');


-- The images have to stay readable: an application loads them from the URL the API returns.

select tests.ok(
  (select public from storage.buckets where id = 'sstv-images'),
  'the event image bucket is public');

select tests.ok(
  (select count(*) from pg_policies
   where schemaname = 'storage' and policyname = 'Public can read sstv images'
     and 'anon' = any (roles)) = 1,
  'anyone may read an event image');

\echo 'All schema assertions passed.'
