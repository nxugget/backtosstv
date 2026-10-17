# Working in this repository

## Changes

- Work on `main`. No feature branches unless asked for one.
- Before pushing: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`,
  `npm run build`, and `npm run test:schema` when the schema moved.
- Never edit a migration that has been applied. Write a new one.
- Everything about the database lives in `supabase/migrations`, never only in the dashboard.
