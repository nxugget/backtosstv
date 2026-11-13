-- Run by `supabase db reset` against the local stack only, never against the hosted project.
--
-- Satellites, not events: a NORAD number and a name are public facts from the catalogue, so seeding
-- them costs nothing and gives the admin's picker something to show. Events are what this project
-- curates by hand, and inventing them, even for a local database, is how a fixture ends up quoted
-- as if it were real.

insert into public.satellites (norad_id, name, alternate_name)
values
  (25544, 'ISS', 'ZARYA'),
  (40931, 'LAPANA2', 'IO-86'),
  (57172, 'RS40S', null),
  (57180, 'RS58S', null),
  (67290, 'RS18S', null)
on conflict (norad_id) do nothing;
