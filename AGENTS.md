# Working in this repository

- Next.js 16 on Turbopack. Its APIs and file conventions differ from what older guides assume, so
  read the relevant page in `node_modules/next/dist/docs/` before changing routing, layouts or
  metadata.
- TypeScript runs strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on. No
  `any`, and no non-null assertion to silence a type.
- `src/lib/api/catalogue.ts` is the only module that reads the public tables, through explicit
  column lists and never `select("*")`. It uses a key that bypasses Row Level Security, so a stray
  column there would be published.
- Every schema change is a migration in `supabase/migrations`. Never change a migration that has
  already been applied, and never leave a change in the Supabase dashboard alone.
- Comments say why, not what.

## Verify before finishing

```bash
npm run lint && npm run typecheck && npm run format:check && npm test && npm run build
```

When `supabase/migrations` changed, also run:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:schema
```

## Where things live

- `src/lib/api/` holds the public v1 API.
- `src/app/shack/` holds the admin area, behind passkey sign-in.
- `src/lib/globe-data.ts` and `src/components/dotted-globe.tsx` draw the home page globe.
- `supabase/migrations/20261017220000_baseline.sql` is the whole schema, squashed into one file.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->