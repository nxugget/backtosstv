<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository conventions

- Next.js 16 on Turbopack, with breaking changes from what older guides assume. Before touching
  routing, layouts, or metadata, read the guide for that feature in `node_modules/next/dist/docs/`.
- TypeScript is strict: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on. No
  `any`, no non-null assertions to get past a type.
- The public catalogue is read only through `src/lib/api/catalogue.ts`, with explicit column lists.
  Nothing else reads the public tables, because that module uses a key that bypasses Row Level
  Security.
- Database changes are migrations in `supabase/migrations`, never edits made in the dashboard.
- Comments explain why, not what.

## Verify before you are done

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

When `supabase/migrations` changed, also run:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:schema
```

## Key modules

- `src/lib/api/` : the public v1 API. `catalogue.ts` is its only reader of the public tables.
- `src/app/shack/` : the admin area, behind passkey sign-in.
- `src/lib/globe-data.ts` and `src/components/dotted-globe.tsx` : the home page globe.
- `supabase/migrations/20261017220000_baseline.sql` : the whole schema, squashed into one file.

