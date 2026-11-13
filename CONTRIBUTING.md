# Contributing

Code contributions: what to change, how to test it, and what the review looks for.

## Work on the code

Node.js 20.19 or later, or 22.12 or later.

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

`.env.example` lists every variable and what it is for. The short version:

| Variable                               | Why                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key; grants `anon`, which cannot read the catalogue tables     |
| `SUPABASE_SECRET_KEY`                  | server-only; **the API reads with this**, which is why it is the only door |
| `BOOTSTRAP_TOKEN`                      | server-only; guards `/shack/bootstrap` and signs invite links              |
| `SITE_URL`                             | optional; public origin, used to build invite links                        |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN`    | optional; counts the request budget in Redis instead of Postgres           |
| `RATE_LIMIT_PER_MINUTE`                | optional; requests per minute per caller, default 120                      |

`lint` and `typecheck` run `next typegen` first: `PageProps`, `LayoutProps` and `RouteContext` are
generated from the route tree, so neither tool can resolve them on a fresh checkout otherwise.

Before opening a pull request:

```bash
npm run lint && npm run typecheck && npm run format:check && npm test && npm run build
```

CI runs exactly that, on the oldest supported Node and on current LTS.

If you touched `supabase/migrations`, also run the schema tests, which need a Postgres to talk to
and nothing else:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:schema
```

They rebuild the schema from scratch and assert the access model. CI runs them too, against a
service container.

### What the review will look for

- **Does the public API keep its promise?** Changing a response shape, a parameter or an error code
  is a breaking change for someone's app. [`docs/api-stability.md`](./docs/api-stability.md) says
  what is allowed within `v1`.
- **Is a new bound in both places?** A validation rule belongs in the database as a constraint and
  in `src/lib/shack.ts` as the number the form checks. One without the other drifts.
- **Does it read the catalogue through `src/lib/api/catalogue.ts`?** That module is the only code
  that reads the public tables, with explicit column lists, because it uses a key that bypasses Row
  Level Security. A `select("*")` there would publish whatever a migration adds next, including the
  columns holding administrators' user ids.
- **Are the pure parts tested?** Parsing, formatting and anything deciding what gets deleted are
  unit-tested with Vitest. A change to a policy, a grant or a constraint belongs in
  `supabase/tests/10-assertions.sql`: that file is what keeps "the anonymous role cannot read the
  catalogue" a fact rather than an intention. Anything needing a running application goes in
  `scripts/smoke-test.sh`, which `npm run test:api` runs against a server you point it at.
- **Does `openapi.json` still match?** A contract test fails when the document and the code disagree
  about a status, an error code, a mode, the page size or the licence.

### Conventions

Prettier and ESLint decide formatting and style; there is nothing to argue about there. Beyond them:

- TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. No
  `any`, no non-null assertions to get past a type.
- Comments explain **why**, not what. The code says what it does.
- Database changes are migrations in `supabase/migrations`, never changes made in the dashboard. See
  [`docs/database.md`](./docs/database.md).
- Commit messages explain what was wrong and why the change is the fix, in prose. The diff shows the
  what.

### Things to agree on before building

Open an issue first for: a new endpoint, a new field on an existing response, a change to how
`status` is computed, anything that writes to the catalogue from outside the admin, and any new
dependency. There are six runtime dependencies today and that is deliberate.

## AI assistance

This project is built with AI assistance. Contributions that are human, AI-assisted, or entirely
generated are all welcome, and all of them are held to the same bar: the checks above pass, a human
has read the change and can stand behind it, and nothing is copied in that you do not have the right
to publish. When AI did most of the work, say so in the pull request. It does not change what is
expected of the result; it tells the reviewer what to read twice.

## Code of conduct

Be decent to each other. Amateur radio has always run on people helping strangers for no reason
other than that it is interesting, and that is the standard here. Anyone who makes this a worse
place to be is asked to stop, and then removed.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](./SECURITY.md) says where to send it.
