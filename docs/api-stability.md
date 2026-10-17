# What `v1` promises

If you are shipping something that depends on this API, this is the contract.

## Will not change within `v1`

- **The envelope.** A list endpoint answers
  `{ count, limit, offset, next, previous, license, results }`. A single resource answers
  `{ data, license }`.
- **Field names and types that already exist.** `frequency_mhz` stays a number in MHz,
  `satellite.norad_id` stays an integer, timestamps stay RFC 3339 with a `Z`.
- **Error shape and codes.** `{ "error": { "code", "message", "parameter", "request_id" } }`, with
  codes from the enumeration in the reference. Branch on `code`; `message` is for people and may be
  reworded. `parameter` names the query or path parameter the failure is about, and is null where
  the failure is about the request as a whole. `request_id` is also in the `X-Request-Id` header and
  in the log line behind a 500: quote it when reporting a failure. Send your own `X-Request-Id` and
  it comes back unchanged, as long as it is at most 200 characters of letters, digits and
  `= : . _ -`.
- **What `status` means.** `upcoming`, `live` and `past` are computed from the server clock against
  `start_time` and `end_time`, not from a stored column.
- **Ordering.** By `start_time`, ascending except `past`, with `id` breaking ties. Paging through
  the catalogue will not silently skip or repeat an event.
- **That `id` is stable.** The same event keeps the same `id` for as long as it exists.
- **The dump's shape.** `/api/v1/dump.ndjson` stays line-delimited JSON, one object per line, every
  line carrying a `type`, the first a `manifest` with `generated_at`, the last an `end` with the
  counts. Records keep the shape their endpoint serves. New record types may appear, which is why
  reading `type` rather than position is the contract.
- **That a cancelled event keeps its row**, with `cancelled_at` set.
- **That a deleted event leaves a tombstone** on `/api/v1/deletions`, carrying the `id` it had and
  when it went, and that the `id` is never reused. Expect that feed to be nearly always empty: an
  event announced and then called off keeps its row and gains `cancelled_at`, and the admin cannot
  delete at all. A tombstone means an entry that should never have been published. Tombstones are
  kept for **at least 180 days**; past that a client that has been away should refetch rather than
  trust the feed. `resource` says what was deleted, so branch on it: today it is always `event`, and
  another resource getting tombstones would add a value rather than change the meaning of this one.

- **The calendar's identifiers.** `/api/v1/events.ics` keeps `UID` as the event's `id` at this host,
  and `SEQUENCE` only ever grows for a given event. That is what lets a calendar application update
  an entry instead of showing two.

## May change at any time

- **New fields may appear** on any response. Parse defensively: ignore what you do not know.
- **New endpoints, new query parameters, new values for an existing filter** may be added. The
  filters on `/events` are all optional and all combine with `AND`; a new one appearing cannot
  change what an existing request returns.
- **`message` wording**, example payloads and the prose in the reference.
- **Cache lifetimes**, and the exact `ETag` values.
- **`/api/health`**, entirely. It reports on the deployment rather than on the catalogue, so its
  shape is not part of this contract. What will keep working is the part a monitor uses: `200` when
  the API can answer, `503` when it cannot, and the path itself, which sits outside `/api/v1`
  precisely so that a monitor set up today is not pointed inside a version that will one day be
  succeeded. `/api/v1/health` answers the same thing for anyone who found it there.
- **The calendar's wording**: its `SUMMARY` and `DESCRIPTION` are for people, so they may be
  reworded, and the default window may move. The identifiers above will not.
- **The page-size default and maximum** may rise. They will not fall below the current 20 and 100.
- **The size of the request budget**, in either direction. What will not change inside `v1` is how
  it is reported: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and a `429` carrying
  `Retry-After` and the `rate_limited` code. A client that reads those headers rather than assuming
  a number keeps working.

## Would be breaking, and so would mean `v2`

Removing or renaming a field, changing a field's type, changing what an existing parameter value
means, or changing the envelope. If that happens:

- `/api/v1` keeps working for **at least six months** after `/api/v2` is announced, and the
  announcement goes on `/api/v1`'s own response and in the release notes.
- The two versions run side by side during that window. `v1` is not frozen in the meantime: it keeps
  getting the data.

## Three version numbers, and which one matters

- **`v1` in the path** is the contract above. It changes only for a breaking change, and then only
  under the six-month rule.
- **`info.version` in [`openapi.json`](../public/openapi.json)** versions the description, not the
  API. The patch digit moves when wording or an example is corrected, the minor digit when something
  is added that breaks nothing (a new endpoint, parameter or response field), and the major digit
  only alongside a new `v1`. A client never needs to read it; it is there so that two copies of the
  document can be told apart.
- **`openapi: 3.1.0`** is the specification the document is written against, and moves only if it is
  rewritten against another one.

Changes are announced on `/api/v1`'s own response and, once there is a release to announce, in this
repository's releases on GitHub. There is no changelog file: before the first release the commit log
is the record, and after it a release note is both easier to find and harder to let go stale.

## Deprecation, in practice

A field that is going away keeps being served, documented as deprecated, and only then stops. We
will not remove something inside `v1` because it has become inconvenient to maintain.

## What is not promised at all

Uptime. This is a hobby project, maintained by volunteers, on hosting nobody is paid to watch. It is
not an SLA, it has no on-call, and it may be down while someone is asleep. Cache what you need, and
degrade gracefully when a request fails. [`terms.md`](./terms.md#no-warranty) says the rest.
