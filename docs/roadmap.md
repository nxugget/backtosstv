# Roadmap

What is missing, in the order it will start to hurt. This is a working list, not a promise.

## Before this gets traffic

- **Moving the budget's counters to Redis.** They are in Postgres today, which works from the first
  deployment but puts a write in front of the read it protects. An Upstash or Vercel KV store and
  the two variables from `.env.example` move them, with no code change. Worth doing when the traffic
  is worth it, or when the extra round trip starts showing in response times.
- **A firewall rule in front of it.** Vercel rate-limits at the edge, before a function runs at all,
  which is strictly better against a flood than anything application code can do, and the project's
  plan includes it, so this is configuration rather than work. Do this one first. The two are
  complements: the firewall absorbs an attack, the budget tells a legitimate integration where it
  stands.
- **Usage figures.** The limiter counts requests but keeps no history: `api_request_counters` holds
  one row per caller, overwritten each window and deleted after an hour. Vercel's Firewall tab
  answers the live half of this for nothing, with traffic grouped by user agent, path or address, so
  what is missing is only the part that needs memory: how much was served last month, and whether an
  integration is growing.
- **Something watching `/api/health`.** The endpoint exists now, outside the request budget and
  answering `503` when the catalogue does not. Nothing polls it: an uptime monitor pointed at it is
  the cheapest way to stop finding out about an outage from a user.
- **A `User-Agent` roll-up.** Deliberately not built yet. A row per day, per user agent, per
  endpoint would give the memory the dashboard lacks, but the dashboard answers "who is hammering
  this right now", which is the question this traffic actually raises, and a write on every request
  is a poor price for an answer nobody is asking. Worth building on any of three triggers: a user
  agent worth following over weeks shows up, monthly figures are wanted ("the API serves N
  applications" cannot be written without them), or the project moves to a plan where a log drain
  does it without code. What has been done meanwhile is the half that costs nothing and that
  everything else rests on: the `User-Agent` request is published in the reference document and in
  the `/api/v1` index, not only in the terms. A rule kept where nobody reads it cannot fairly be
  enforced later.

## To be a reference

- **The public site.** `/` is a holding page. The data is published but not shown: no list of
  upcoming transmissions, no map, no archive of received images.
- **More satellites, and better names.** The catalogue is a handful of rows. Pulling names and NORAD
  numbers from a public source, rather than typing them, would also fix the ones that are wrong.
- **An events feed per satellite** (`/api/v1/satellites/{norad_id}/events`), once there are enough
  events for that to beat `?norad_id=`.
- ~~**iCalendar output.**~~ Done: `/api/v1/events.ics`, with every filter the events endpoint takes,
  so a calendar of one satellite or one operator is a query string. A cancelled transmission carries
  `STATUS:CANCELLED`, which is what makes cancelling one in the admin reach a subscriber's phone.
- **Received images.** The interesting artefact of an SSTV pass is the picture someone decoded.
  Accepting submissions means moderation, storage and a licence question, so it is its own project.

## Credibility

- **A source on every event.** The field exists; the habit has to follow. An event without one
  should eventually be an exception the admin complains about.
- **Public contribution without GitHub.** Reporting an event currently means opening an issue. A
  form on the site would reach the radio amateurs who will never open a pull request.
- **Visible provenance.** The API returns `source_url`; the site should show it next to every event.

## Engineering

- **Tests through the application, not just the schema.** The policies and constraints are covered
  by `scripts/test-schema.sh` in CI; the route handlers and server actions that sit on top are not.
  That needs a Supabase the tests can write to, which is a CI and credentials question.
- **`count` without the exact count.** Every list request runs an exact `COUNT`. Fine at this size,
  the slowest query in the API at a hundred thousand events.
- **Cursor paging.** `offset` is fine for browsing and wrong for scanning the whole catalogue while
  rows are being inserted. `(start_time, id)` is already the total order a cursor would need.
- **Generating `openapi.json`** from the code instead of keeping it honest with a contract test.
- **An import path for bulk announcements**, with the same validation as the admin, for the day a
  source publishes a machine-readable schedule.
- **`satellite.js` back to 7.** It is held at 6.0.2 on purpose. Version 7 ships a multi-threaded
  WebAssembly build whose pthreads entry imports `node:worker_threads`, which a browser does not
  have; `dist/index.js` re-exports it, so any import of the package drags it into the client graph.
  Webpack refuses outright, and Turbopack never finishes resolving it: a production build that ran
  for fifty minutes without completing, which is how it was found. The globe only calls the pure
  JavaScript functions, so 6.0.2 costs nothing today. Move back when the package stops pulling that
  runtime into a browser bundle, and check `npm run build` finishes in seconds before merging it.
- **Vendoring the fonts.** `next/font/google` downloads the three families at build time and
  self-hosts the result, so no visitor's browser ever talks to Google, but a build cannot finish
  while `fonts.google.com` is unreachable, which has already cost one CI run and would cost a
  deployment the same way. Carrying the woff2 files and using `next/font/local` makes the build
  offline and reproducible, at the price of the binaries and their SIL Open Font Licence in the
  repository.

## Known and accepted

- **The event images bucket is public**, so images are hotlinkable and the egress is ours. That is
  what makes them usable in an app.
- **`BOOTSTRAP_TOKEN` travels in a query string**, so it lands in access logs and browser history.
  It is single-purpose, rotatable, and only useful against an account that holds no passkey yet.
- **No uptime guarantee.** A hobby project, maintained by volunteers, on hosting nobody is paid to
  watch. [`api-stability.md`](./api-stability.md) says so to consumers plainly.
