# BackToSSTV

**A free, open API for slow scan television transmissions from amateur satellites.**

When the ISS or an amateur satellite transmits SSTV, the announcement lands in an AMSAT bulletin, an
ARISS page, a club post or a message on social media, and then scatters. There is no database you
can query for it. BackToSSTV is that database: a handful of radio amateurs read the announcements,
verify them and publish them here, and this API serves them to anyone who wants to show them: a
website, a phone app, a rotator controller, a Discord bot.

The code is open so that the rules over the data can be read by anyone. The catalogue is free to use
**provided you credit it**; see [Licence](#licence).

API reference: `/api-reference` · OpenAPI: [`public/openapi.json`](./public/openapi.json)

## The API

No key, no sign-up, CORS open to any origin:

```bash
curl https://backtosstv.org/api/v1/events
```

```json
{
  "count": 1,
  "limit": 20,
  "offset": 0,
  "next": null,
  "previous": null,
  "license": {
    "name": "CC BY 4.0",
    "url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution": "SSTV event data from BackToSSTV, licensed CC BY 4.0"
  },
  "results": [
    {
      "id": "0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f",
      "satellite": { "norad_id": 25544, "name": "ISS", "alternate_name": "ZARYA" },
      "operator": {
        "slug": "ariss",
        "name": "ARISS",
        "url": "https://www.ariss.org/",
        "logo_url": null
      },
      "start_time": "2026-09-14T09:12:00.000Z",
      "end_time": "2026-09-14T09:24:00.000Z",
      "frequency_mhz": 145.8,
      "mode": "PD120",
      "transmit_power_watts": 10,
      "title": "ARISS SSTV activity",
      "image_url": null,
      "image_interval_seconds": 120,
      "source_url": "https://www.ariss.org/",
      "cancelled_at": null,
      "created_at": "2026-09-13T18:00:00.000Z",
      "updated_at": "2026-09-13T18:00:00.000Z"
    }
  ]
}
```

| Endpoint                        | What it answers                                   |
| ------------------------------- | ------------------------------------------------- |
| `/api/v1`                       | the endpoints, the documentation and the licence  |
| `/api/v1/events`                | a page of events                                  |
| `/api/v1/events/live`           | the ones transmitting right now                   |
| `/api/v1/events/upcoming`       | the ones that have not started                    |
| `/api/v1/events/past`           | the ones already finished                         |
| `/api/v1/events/{id}`           | one event, to refresh what you cached             |
| `/api/v1/satellites`            | the satellites events point at                    |
| `/api/v1/satellites/{norad_id}` | one satellite                                     |
| `/api/v1/operators`             | the organisations that run the transmissions      |
| `/api/v1/operators/{slug}`      | one operator                                      |
| `/api/v1/deletions`             | events that no longer exist, so you can drop them |
| `/api/v1/dump.ndjson`           | the whole catalogue in one file                   |
| `/api/v1/events.ics`            | the same events, for your calendar                |
| `/api/health`                   | whether the API is answering                      |

`GET /api/v1/events` takes `status` (`upcoming` by default, then `live`, `past`, `all`), `norad_id`,
`operator`, `mode`, `start_after`, `start_before`, `cancelled`, `since`, `limit` (20, up to 100) and
`offset`, and so do the three window paths. A cancelled event is included unless you ask for
`cancelled=false`, because an event called off is something your users need to see. `status` is
relative to the server clock and `start_after`/`start_before` are absolute, so they combine:
`?status=upcoming&start_before=2026-09-21T00:00:00Z` is "the next week" without arithmetic on your
side. Errors come back as a stable `{ code, message }`. All timestamps are UTC, serialised with a
`Z`.

Four things worth knowing before you build on it:

- **Attribution is required.** The data is CC BY 4.0 and every response repeats the terms. See
  [Licence](#licence).
- **Synchronise with `?status=all&since=`** rather than refetching. Keep the largest `updated_at`
  you have seen and pass it back. `status` defaults to `upcoming`, so `since` on its own will never
  tell you that a live or past event was corrected or called off: synchronising means asking for
  `all`. Responses also carry `ETag` and `Last-Modified`, so `If-None-Match` or `If-Modified-Since`
  gets you a `304` with no body.
- **A cancelled event keeps its row** and gains a `cancelled_at`, so a client that cached it finds
  out. A row that vanishes was an entry made in error, and `/api/v1/deletions?since=` is how you
  hear about it: synchronising is those two requests together, one for what changed and one for what
  is gone. Tombstones are kept for at least 180 days.
- **There is a request budget**, reported in `RateLimit-*` headers, with `429` and `Retry-After`
  when it runs out. Cached responses do not count against it, so the two points above are also how
  you stay well clear of it. See [the terms](./docs/terms.md#the-request-budget).
- **Every event should name its source.** `source_url` is the announcement it was taken from, so you
  can check an entry, and so can your users.

### In your calendar, without writing anything

Paste this into Google Calendar, Apple Calendar, Outlook or Thunderbird, under "subscribe to
calendar from URL":

```
https://backtosstv.org/api/v1/events.ics
```

The next pass arrives on your phone with a reminder. Every filter below works, so `?norad_id=25544`
is a calendar of the ISS alone and `?operator=ariss` one of ARISS's series. A transmission that gets
cancelled is marked cancelled, and your calendar strikes it through or removes it on its own, which
is most of the point.

### Mirroring the whole catalogue

Do not page the list endpoints to read everything: each page runs an exact `COUNT`, and it spends a
budget meant for clients asking about transmissions.

```bash
curl https://backtosstv.org/api/v1/dump.ndjson
```

One JSON object per line, each with a `type`: a `manifest`, then every `operator`, `satellite` and
`event`, then an `end` line carrying the counts. Records are the same shape the endpoints serve. The
`end` line is how you know you have all of it, because a stream that fails halfway cannot change its
status code.

Then keep it current from the manifest's `generated_at`:

```bash
curl "https://backtosstv.org/api/v1/events?status=all&since=$GENERATED_AT"   # what changed
curl "https://backtosstv.org/api/v1/deletions?since=$GENERATED_AT"           # what is gone
```

`HEAD` the dump, or send `If-Modified-Since`, to be told in one request that nothing has moved.

Read [`docs/api-stability.md`](./docs/api-stability.md) before shipping something that depends on
`v1`: it says what will not change, what might, and how long a version lives.

## Using the data

Free, including commercially, as long as BackToSSTV is credited. The terms are in
[`docs/terms.md`](./docs/terms.md) and the credit line is in [Licence](#licence) below.

## Contributing

Code contributions are welcome. Setup and conventions are in
[CONTRIBUTING.md](./CONTRIBUTING.md#work-on-the-code).

Security issues go to [SECURITY.md](./SECURITY.md), not to a public issue.

## Licence

Two licences, because the code and the catalogue are not the same thing.

- **Code**: [MIT](./LICENSE). Take it, change it, ship it.
- **Data served by the API**: [CC BY 4.0](./LICENSE-DATA). Use it, including commercially,
  **provided you credit BackToSSTV**. Every API response repeats the terms in its `license` object
  and in a `Link: <...>; rel="license"` header.

Credit that satisfies it:

> SSTV event data from [BackToSSTV](https://backtosstv.org), licensed
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The catalogue exists because people read announcements and check them by hand. Attribution is what
sends the next reader back to that work, so it is a condition and not a courtesy.
