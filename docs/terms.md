# Terms of use

Short version: the data is free to use, you must credit BackToSSTV, there is no warranty, and don't
hammer the API.

## The data

Everything the API returns is licensed [CC BY 4.0](../LICENSE-DATA). You may copy it, redistribute
it, remix it and build on it, for any purpose including a commercial one, provided you:

- **credit BackToSSTV** and link to it,
- **link to the licence**, and
- **say if you changed anything**.

A credit that satisfies this:

> SSTV event data from [BackToSSTV](https://backtosstv.org), licensed
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Put it where someone looking at the data would see it: a footer, an about screen, a data-sources
page. Burying it in a licences file nobody opens is not the spirit of it, though it is probably the
letter.

Every response carries these terms in its `license` object and in a `Link: <...>; rel="license"`
header, so an integration never has to go looking.

The code is separately licensed under the [MIT licence](../LICENSE), which covers the software and
not the data.

## No warranty

The catalogue is compiled by volunteers from public announcements. It will sometimes be wrong, out
of date, or missing an event entirely. **Do not rely on it for anything that matters.**

Specifically, it is not a source of truth for operating a station, for predicting a pass, or for
anything safety-related. An announced transmission may be cancelled without the cancellation
reaching us. The data is provided as is, with no warranty of any kind, and the maintainers are not
liable for anything that follows from using it.

## Using the API

There is no key and no sign-up, and we would like to keep it that way. In exchange:

- **Cache.** Responses carry `Cache-Control`, `ETag` and `Last-Modified`. Respect them, and send
  `If-None-Match` (or `If-Modified-Since`, which is honoured too) so an unchanged response comes
  back as a `304` with no body. A request your own cache answered never reaches us, and that is the
  one that is also free of the budget.
- **Synchronise with `?status=all&since=`** instead of refetching the catalogue. One request where
  there would have been hundreds. `status` defaults to `upcoming`, so `since` on its own would not
  show you a past event that was corrected. Ask `/api/v1/deletions?since=` in the same breath: that
  is the only place a deletion is reported.
- **Keep polling sane.** Events are entered by hand, a handful a week. Checking every few minutes is
  pointless; once an hour is plenty, and `since` makes it cheap.
- **Subscribing a calendar is fine**, and it is what `/api/v1/events.ics` is for. Clients refetch it
  a few times a day on their own, which the cache absorbs; the feed asks them for hourly.
- **Want all of it? Take the dump.** `/api/v1/dump.ndjson` is the whole catalogue in one request.
  Paging the list endpoints to read everything is the expensive way round for both of us, and it is
  the one use of this API that would make us think about keys.
- **Identify yourself** with a `User-Agent` naming your application and a way to reach you, as
  `AllmySat/2.3.0 (+https://allmysat.com)` does. If something you built starts misbehaving, that
  header is what lets us warn you instead of blocking you. A page running in a browser cannot set
  it, and nothing is asked of one.
- **Do not scrape around the API.** The endpoints are the interface; the database behind them is not
  reachable another way by design.

## The request budget

There is a per-caller limit, counted per minute, and it is set generously: a client that caches and
sends `If-None-Match` will not come close, because **a response served from the cache does not count
against it at all**. Varying the query string on every request is what spends it.

The budget is per caller, identified by the address the host reports. A request the host cannot
attribute to anyone is not counted rather than being charged to a budget shared with everybody. An
IPv6 caller is counted on its `/64` rather than on the exact address, because that is what a single
subscriber is handed: all of it is one of you.

Traffic may also be refused before it reaches the application, by the host's own firewall. That one
reports nothing and simply refuses; the headers below describe the application's budget.

Every response tells you where you stand:

| Header                | Meaning                          |
| --------------------- | -------------------------------- |
| `RateLimit-Limit`     | requests allowed per minute      |
| `RateLimit-Remaining` | how many are left in this window |
| `RateLimit-Reset`     | seconds until the window resets  |

One caveat, because it would otherwise be a surprise: these describe one caller, while a response is
cacheable and shared. A response that came from a cache rather than from us carries the numbers of
whoever filled that cache, so treat `RateLimit-Remaining` as a hint and the `429` as the answer. The
`429` is never cached.

Over the budget, the answer is `429` with `Retry-After` and
`{ "error": { "code": "rate_limited", ... } }`. Wait the stated number of seconds; do not retry in a
tight loop. If your use needs more than the budget allows, say so in an issue. A legitimate
integration is the reason this catalogue exists, and the number is not a judgement about you.

Traffic that threatens the service for everyone else may still be blocked outright. Persistent abuse
is the thing most likely to force API keys on everyone; please don't be the reason.

## Changes

These terms may change; the licence on data already published will not be made more restrictive.
What the API itself promises, and for how long, is in [`api-stability.md`](./api-stability.md).
