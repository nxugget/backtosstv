#!/usr/bin/env bash
# End-to-end checks against a running server: status codes, the response envelope, caching and the
# licence. Needs a database it can actually read, so it covers what the unit tests cannot.
#
#   npm run dev                      # or npm start, against a real Supabase project
#   bash scripts/smoke-test.sh
#   BASE_URL=https://backtosstv.org bash scripts/smoke-test.sh
set -euo pipefail

base="${BASE_URL:-http://localhost:3000}"
api="${base}/api/v1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Every request goes through this. Retrying matters when the target is a production host at the far
# end of a long link: a connection that drops before any answer arrives says nothing about the API,
# whereas an answer with the wrong status is exactly the finding we are after. A request that still
# gets no answer after the retries is reported as a failed assertion rather than ending the run, so
# one flaky connection cannot hide the thirty checks that come after it.
curl_args=(--silent --show-error --connect-timeout 5 --max-time 30 --retry 3 --retry-delay 2 --retry-all-errors)

# Those retries are for a host that answers unreliably. A host that is not there at all would make
# every one of the assertions below wait out its timeouts, so the first thing checked is that
# something is listening, and the run stops with one line rather than several minutes of nothing.
if ! curl --silent --output /dev/null --connect-timeout 5 --max-time 20 "$api"; then
  printf 'Nothing answered at %s\n' "$api" >&2
  printf 'Start a server, or point BASE_URL at one: BASE_URL=https://backtosstv.org npm run test:api\n' >&2
  exit 1
fi

pass=0
fail=0

ok() {
  printf 'ok   %s\n' "$1"
  pass=$((pass + 1))
}

ko() {
  printf 'FAIL %s\n   %s\n' "$1" "$2"
  fail=$((fail + 1))
}

# Asserts the status code of one request.
status() {
  local label="$1" expected="$2" url="$3"
  local body code
  body="$(mktemp)"
  code="$(curl "${curl_args[@]}" -o "$body" -w '%{http_code}' "$url" || echo 'no answer')"

  if [ "$code" = "$expected" ]; then
    ok "$label ($code)"
  else
    ko "$label" "expected $expected, got $code: $(head -c 200 "$body")"
  fi

  rm -f "$body"
}

# Asserts a condition over a JSON body. The expression is JavaScript, with the parsed body as `d`.
json() {
  local label="$1" url="$2" expression="$3"
  local body
  body="$(curl "${curl_args[@]}" "$url" || true)"

  # A failure prints the body rather than a stack trace: when an endpoint answers an error instead
  # of a page, the missing field is the symptom and the body is the cause.
  if printf '%s' "$body" | node -e "
    let input = '';
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => {
      let d;
      try {
        d = JSON.parse(input);
      } catch {
        console.error('not JSON: ' + input.slice(0, 200));
        process.exit(1);
      }
      let passed = false;
      try {
        passed = Boolean($expression);
      } catch (cause) {
        console.error(cause.message + ' in ' + JSON.stringify(d).slice(0, 200));
        process.exit(1);
      }
      if (!passed) {
        console.error(JSON.stringify(d).slice(0, 300));
        process.exit(1);
      }
    });
  " 2>/tmp/smoke-json.$$; then
    ok "$label"
  else
    ko "$label" "$(cat /tmp/smoke-json.$$)"
  fi

  rm -f "/tmp/smoke-json.$$"
}

# The response headers of one request, one per line, without the carriage returns.
head_of() {
  curl "${curl_args[@]}" --head "$1" 2>/dev/null | tr -d '\r' || true
}

# Asserts that a response header is present, and matches when a pattern is given.
header() {
  local label="$1" url="$2" name="$3" pattern="${4:-}"
  local value
  value="$(head_of "$url" | awk -v n="$name" 'BEGIN{IGNORECASE=1} tolower($1) == tolower(n ":") {sub($1 " ", ""); print}')"

  if [ -z "$value" ]; then
    ko "$label" "no $name header"
  elif [ -n "$pattern" ] && ! printf '%s' "$value" | grep -qi -- "$pattern"; then
    ko "$label" "$name is '$value', expected to match '$pattern'"
  else
    ok "$label"
  fi
}

echo "== discovery =="
status "index" 200 "$api"
json "index lists the endpoints" "$api" \
  "['events','satellites','operators','deletions'].every((k) => typeof d.endpoints[k] === 'string')"
json "index states the licence" "$api" "d.license.name === 'CC BY 4.0' && d.license.attribution.includes('BackToSSTV')"
json "index asks for a User-Agent, where a client will see it" "$api" \
  "d.user_agent.includes('User-Agent') && d.user_agent.includes('reach you')"

echo "== events =="
for filter in "" "?status=upcoming" "?status=live" "?status=past" "?status=all" \
  "?status=all&limit=2&offset=1" "?status=all&norad_id=25544" "?status=all&cancelled=false" \
  "?status=all&since=2026-01-01T00:00:00Z"; do
  status "GET /events${filter}" 200 "${api}/events${filter}"
done

json "envelope" "${api}/events?status=all&limit=3" \
  "['count','limit','offset','next','previous','license','results'].every((k) => k in d)"
json "echoes the applied page" "${api}/events?status=all&limit=3" "d.limit === 3 && d.offset === 0"
json "results are an array" "${api}/events?status=all&limit=3" "Array.isArray(d.results)"
json "every event carries its satellite and licence fields" "${api}/events?status=all&limit=3" \
  "d.results.every((e) => typeof e.id === 'string' && typeof e.satellite.norad_id === 'number' && 'cancelled_at' in e && 'source_url' in e && 'updated_at' in e)"
json "timestamps end in Z" "${api}/events?status=all&limit=3" \
  "d.results.every((e) => e.start_time.endsWith('Z') && e.end_time.endsWith('Z'))"
json "no internal columns leak" "${api}/events?status=all&limit=3" \
  "d.results.every((e) => !('created_by' in e) && !('updated_by' in e) && !('norad_id' in e) && !('operator_id' in e))"
json "a page past the end is empty but still counts" "${api}/events?status=all&offset=100000" \
  "d.results.length === 0 && typeof d.count === 'number'"
json "previous is null on the first page" "${api}/events?status=all" "d.previous === null"

echo "== the status windows =="
# Each path is the filter under another name. If one ever grows logic of its own, these stop
# agreeing, which is the whole reason the aliases share a single handler.
for window in live upcoming past; do
  status "GET /events/${window}" 200 "${api}/events/${window}"
  json "/events/${window} is ?status=${window}" "${api}/events/${window}" \
    "d.count === $(curl "${curl_args[@]}" "${api}/events?status=${window}" | node -e "
      let input = '';
      process.stdin.on('data', (chunk) => (input += chunk));
      process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input).count)));
    ")"
done
json "the path wins over a status parameter" "${api}/events/past?status=upcoming" \
  "d.results.every((e) => new Date(e.end_time) < new Date())"

echo "== operators =="
status "GET /operators" 200 "${api}/operators"
json "operators envelope" "${api}/operators?limit=2" \
  "Array.isArray(d.results) && d.results.every((o) => typeof o.slug === 'string' && 'logo_url' in o)"
json "no internal id is published: the slug is the identifier" "${api}/operators?limit=5" \
  "d.results.every((o) => !('id' in o))"
status "unknown operator" 404 "${api}/operators/nobody-here"
status "a slug that is not one" 400 "${api}/operators/Not_A_Slug"

# The two directions have to agree: a slug an event reports must resolve, and the operator it
# resolves to must be the one the event named.
slug="$(curl "${curl_args[@]}" "${api}/events?status=all&limit=1" | node -e "
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.parse(input).results[0]?.operator?.slug ?? '');
    } catch {
      process.stdout.write('');
    }
  });
" || true)"

if [ -n "$slug" ]; then
  status "the slug an event reports resolves" 200 "${api}/operators/${slug}"
  json "and resolves to the same operator" "${api}/operators/${slug}" "d.data.slug === '${slug}'"
  json "filtering events by it returns only theirs" "${api}/events?status=all&operator=${slug}" \
    "d.results.every((e) => e.operator.slug === '${slug}')"
else
  ok "no event to take an operator slug from"
fi

echo "== the event filters =="
status "mode" 200 "${api}/events?status=all&mode=PD120"
status "an absolute window" 200 "${api}/events?status=all&start_after=2020-01-01T00:00:00Z&start_before=2100-01-01T00:00:00Z"
json "the window really bounds start_time" "${api}/events?status=all&start_after=2020-01-01T00:00:00Z&limit=100" \
  "d.results.every((e) => new Date(e.start_time) >= new Date('2020-01-01T00:00:00Z'))"
json "mode really filters" "${api}/events?status=all&mode=PD120&limit=100" \
  "d.results.every((e) => e.mode === 'PD120')"
status "a mode that does not exist" 400 "${api}/events?mode=pd120"
status "an operator that is not a slug" 400 "${api}/events?operator=NOPE"
status "a start_after that is not a date" 400 "${api}/events?start_after=soon"
status "a start_before that is not a date" 400 "${api}/events?start_before=2026-02-30"

echo "== deletions =="
status "GET /deletions" 200 "${api}/deletions"
status "GET /deletions?since=" 200 "${api}/deletions?since=2026-01-01T00:00:00Z"
json "deletions use the same envelope" "${api}/deletions?limit=3" \
  "['count','limit','offset','next','previous','license','results'].every((k) => k in d)"
json "every deletion says what went, when, and under which id" "${api}/deletions?limit=3" \
  "d.results.every((r) => r.resource === 'event' && typeof r.id === 'string' && r.deleted_at.endsWith('Z'))"
json "oldest first, so paging with since never goes backwards" "${api}/deletions?limit=100" \
  "d.results.every((r, i) => i === 0 || d.results[i - 1].deleted_at <= r.deleted_at)"
# The two halves of the claim have to agree: an id on this feed must not resolve as an event.
deleted_id="$(curl "${curl_args[@]}" "${api}/deletions?limit=1" | node -e "
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.parse(input).results[0]?.id ?? '');
    } catch {
      process.stdout.write('');
    }
  });
" || true)"

if [ -n "$deleted_id" ]; then
  status "an id on the deletions feed is gone from the catalogue" 404 "${api}/events/${deleted_id}"
else
  ok "nothing has been deleted yet, so there is no id to cross-check"
fi

status "deletions reject a bad since like every other endpoint" 400 "${api}/deletions?since=yesterday"

echo "== satellites =="
status "GET /satellites" 200 "${api}/satellites"
json "satellites envelope" "${api}/satellites?limit=2" \
  "Array.isArray(d.results) && d.results.every((s) => typeof s.norad_id === 'number' && 'alternate_name' in s)"

echo "== health =="
# The version-independent path is the one a monitor is pointed at, so it is the one checked first.
status "GET /api/health" 200 "${base}/api/health"
json "it says the catalogue answered, and how fast" "${base}/api/health" \
  "d.status === 'ok' && d.catalogue.reachable === true && typeof d.catalogue.latency_ms === 'number'"
header "a healthy answer may be held briefly" "${base}/api/health" "cache-control" "max-age=5"
status "the versioned path answers too" 200 "${api}/health"
json "and answers the same thing" "${api}/health" "d.status === 'ok'"

echo "== the calendar =="
status "GET /events.ics" 200 "${api}/events.ics"
header "it is a calendar" "${api}/events.ics" "content-type" "text/calendar"
status "the filters work on it too" 200 "${api}/events.ics?norad_id=25544"
status "and a bad one is still a 400" 400 "${api}/events.ics?mode=nope"

# Into a file, not a variable: command substitution strips trailing newlines, and the last thing a
# calendar must have is its CRLF. Checking it through `$(...)` could never pass.
calendar_file="$(mktemp)"
curl "${curl_args[@]}" -o "$calendar_file" "${api}/events.ics" || true

# RFC 5545 is mostly format rules, and the ones that break clients are checkable from here.
if node -e "
  const input = require('fs').readFileSync('$calendar_file', 'utf8');
  {
    const raw = input.split('\r\n');
    if (!input.startsWith('BEGIN:VCALENDAR\r\n') || !input.endsWith('END:VCALENDAR\r\n')) {
      console.error('not wrapped in a VCALENDAR with CRLF endings');
      process.exit(1);
    }
    for (const line of raw) {
      if (Buffer.byteLength(line, 'utf8') > 75) {
        console.error('a line is longer than 75 octets: ' + line.slice(0, 90));
        process.exit(1);
      }
    }
    const unfolded = input.replace(/\r\n /g, '').split('\r\n');
    const opens = unfolded.filter((line) => line === 'BEGIN:VEVENT').length;
    const closes = unfolded.filter((line) => line === 'END:VEVENT').length;
    if (opens !== closes) {
      console.error('unbalanced VEVENT blocks: ' + opens + ' open, ' + closes + ' closed');
      process.exit(1);
    }
    const uids = unfolded.filter((line) => line.startsWith('UID:'));
    if (uids.length !== opens) {
      console.error('every event needs a UID: ' + uids.length + ' for ' + opens + ' events');
      process.exit(1);
    }
    if (new Set(uids).size !== uids.length) {
      console.error('two events share a UID, so a calendar would keep only one');
      process.exit(1);
    }
    for (const line of unfolded.filter((l) => l.startsWith('DTSTART:') || l.startsWith('DTEND:'))) {
      if (!/^(DTSTART|DTEND):\d{8}T\d{6}Z$/.test(line)) {
        console.error('a stamp is not a UTC form: ' + line);
        process.exit(1);
      }
    }
  }
" 2>/tmp/smoke-ics.$$; then
  ok "the calendar is well formed: wrapped, folded, balanced, every event identified"
else
  ko "the calendar is well formed" "$(cat /tmp/smoke-ics.$$)"
fi
rm -f "/tmp/smoke-ics.$$" "$calendar_file"

echo "== the dump =="
status "GET /dump.ndjson" 200 "${api}/dump.ndjson"
header "it is line-delimited JSON" "${api}/dump.ndjson" "content-type" "application/x-ndjson"
header "a mirror may hold it for a while" "${api}/dump.ndjson" "cache-control" "max-age"

dump="$(curl "${curl_args[@]}" "${api}/dump.ndjson" || true)"

# Every line parses on its own, which is the whole promise of the format.
if printf '%s' "$dump" | node -e "
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const lines = input.split('\n').filter((line) => line !== '');
    const records = lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        console.error('line ' + (index + 1) + ' is not JSON: ' + line.slice(0, 120));
        process.exit(1);
      }
    });
    if (records.length < 2) {
      console.error('a dump is at least a manifest and an end');
      process.exit(1);
    }
    const first = records[0];
    const last = records[records.length - 1];
    if (first.type !== 'manifest' || typeof first.generated_at !== 'string') {
      console.error('the first line is not a manifest: ' + JSON.stringify(first).slice(0, 120));
      process.exit(1);
    }
    if (last.type !== 'end' || typeof last.counts !== 'object') {
      console.error('the last line is not an end record: the dump was cut short');
      process.exit(1);
    }
    const counted = { event: 0, operator: 0, satellite: 0 };
    for (const record of records.slice(1, -1)) {
      if (!(record.type in counted)) {
        console.error('unknown record type: ' + record.type);
        process.exit(1);
      }
      counted[record.type] += 1;
    }
    for (const type of Object.keys(counted)) {
      if (counted[type] !== last.counts[type]) {
        console.error(type + ': counted ' + counted[type] + ', end record says ' + last.counts[type]);
        process.exit(1);
      }
    }
  });
" 2>/tmp/smoke-dump.$$; then
  ok "every line parses, the manifest opens it, the end record closes it and the counts agree"
else
  ko "the dump is well formed" "$(cat /tmp/smoke-dump.$$)"
fi
rm -f "/tmp/smoke-dump.$$"

# The dump and the endpoints must describe the same catalogue.
dump_events="$(printf '%s' "$dump" | grep -c '"type":"event"' || true)"
api_events="$(curl "${curl_args[@]}" "${api}/events?status=all&limit=1" | node -e "
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input).count)));
" || echo "")"

if [ "$dump_events" = "$api_events" ]; then
  ok "the dump holds every event the API counts ($dump_events)"
else
  ko "the dump holds every event the API counts" "dump has $dump_events, /events counts $api_events"
fi

last_modified="$(head_of "${api}/dump.ndjson" | awk 'BEGIN{IGNORECASE=1} tolower($1) == "last-modified:" {sub($1 " ", ""); print}')"
if [ -n "$last_modified" ]; then
  code="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' -H "If-Modified-Since: $last_modified" "${api}/dump.ndjson" || echo 'no answer')"
  if [ "$code" = "304" ]; then ok "a mirror holding this copy is told so"; else ko "a mirror holding this copy is told so" "got $code"; fi
else
  ko "a mirror holding this copy is told so" "no Last-Modified on the dump"
fi

echo "== the published document =="
# The document is what an integration is written against, and the only way to know it still
# describes this server is to compare the two. A payload with one field more or one field fewer than
# the schema is a broken promise, whichever side moved.
status "openapi.json is served" 200 "${base}/openapi.json"

documented() {
  node -e "
    const document = JSON.parse(require('fs').readFileSync('$root/public/openapi.json', 'utf8'));
    process.stdout.write(Object.keys(document.components.schemas['$1'].properties).sort().join(','));
  "
}

json "a satellite carries exactly the documented fields" "${api}/satellites?limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0]).sort().join(',') === '$(documented Satellite)'"
json "an event carries exactly the documented fields" "${api}/events?status=all&limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0]).sort().join(',') === '$(documented Event)'"
json "an event nests the satellite as documented" "${api}/events?status=all&limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0].satellite).sort().join(',') === '$(documented EventSatellite)'"
json "a deletion carries exactly the documented fields" "${api}/deletions?limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0]).sort().join(',') === '$(documented Deletion)'"
json "an operator carries exactly the documented fields" "${api}/operators?limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0]).sort().join(',') === '$(documented CatalogueOperator)'"
json "an event nests the operator as documented" "${api}/events?status=all&limit=1" \
  "d.results.length === 0 || Object.keys(d.results[0].operator).sort().join(',') === '$(documented Operator)'"

echo "== bad requests =="
status "unknown status" 400 "${api}/events?status=bogus"
status "limit above the maximum" 400 "${api}/events?limit=101"
status "negative offset" 400 "${api}/events?offset=-1"
status "since that is not a date" 400 "${api}/events?since=yesterday"
status "norad_id that is not a number" 400 "${api}/events?norad_id=abc"
status "cancelled that is not a boolean" 400 "${api}/events?cancelled=1"
status "id that is not a uuid" 400 "${api}/events/1"
status "unknown event" 404 "${api}/events/0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f"
status "unknown satellite" 404 "${api}/satellites/999999998"
json "errors carry a stable code" "${api}/events?status=bogus" \
  "d.error.code === 'invalid_status' && typeof d.error.message === 'string'"
json "errors name the parameter they are about" "${api}/events?limit=101" \
  "d.error.parameter === 'limit'"
json "a path segment is named as the document names it" "${api}/operators/NOT%20A%20SLUG" \
  "d.error.parameter === 'slug'"
json "a failure about no parameter says so rather than guessing" \
  "${api}/events/0f1d2c3b-4a59-4e6d-8b7c-1a2b3c4d5e6f" "d.error.parameter === null"

# The id is only useful if the header and the body agree, so both come from one request.
headers="$(mktemp)"
body="$(curl "${curl_args[@]}" -D "$headers" -H 'X-Request-Id: smoke-test-1' "${api}/events?limit=101" || true)"
sent="$(tr -d '\r' < "$headers" | awk 'BEGIN{IGNORECASE=1} tolower($1) == "x-request-id:" {print $2}')"

if [ "$sent" = "smoke-test-1" ]; then
  ok "the id a client sends comes back in the header"
else
  ko "the id a client sends comes back in the header" "got '$sent'"
fi

if printf '%s' "$body" | grep -q '"request_id":"smoke-test-1"'; then
  ok "and in the body, so one report names one request"
else
  ko "and in the body, so one report names one request" "$(printf '%s' "$body" | head -c 200)"
fi

rm -f "$headers"

header "a browser client may read the id" "${api}/events" "access-control-expose-headers" "X-Request-Id"
# A 200 is held by the shared cache for every caller, so an id in it would be whoever filled it.
if head_of "${api}/events" | grep -qi '^x-request-id:'; then
  ko "a cacheable response carries no request id" "it does"
else
  ok "a cacheable response carries no request id"
fi

echo "== headers =="
header "CORS is open" "${api}/events" "access-control-allow-origin" '\*'
# `s-maxage` and `stale-while-revalidate` are addressed to the shared cache, and a CDN that obeys
# them consumes them instead of passing them on: behind Vercel a caller sees `public, max-age=60`
# and an `x-vercel-cache` of its own. So what the origin sends is pinned by the unit tests, and what
# is asserted here is what a caller actually receives.
header "clients and caches may store it" "${api}/events" "cache-control" "public, max-age=60"
header "validator" "${api}/events" "etag"
header "licence link" "${api}/events" "link" "creativecommons"

etag="$(head_of "${api}/events" | awk 'BEGIN{IGNORECASE=1} tolower($1) == "etag:" {print $2}')"
if [ -n "$etag" ]; then
  code="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' -H "If-None-Match: $etag" "${api}/events" || echo 'no answer')"
  if [ "$code" = "304" ]; then ok "If-None-Match gets 304"; else ko "If-None-Match gets 304" "got $code"; fi
else
  ko "If-None-Match gets 304" "no ETag to send back"
fi

code="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' -X OPTIONS "${api}/events" || echo 'no answer')"
if [ "$code" = "204" ]; then ok "preflight"; else ko "preflight" "got $code"; fi

code="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' -X POST "${api}/events" || echo 'no answer')"
if [ "$code" = "405" ]; then ok "writes are refused"; else ko "writes are refused" "got $code"; fi

echo "== the public pages =="
status "the status page is served" 200 "${base}/status"
status "the credits page is served" 200 "${base}/credits"

echo "== admin is not public =="
status "/shack redirects to the sign-in" 307 "${base}/shack"
status "bootstrap without a token is invisible" 404 "${base}/shack/bootstrap"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
