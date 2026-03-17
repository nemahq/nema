# Supabase

PostgreSQL database + Auth, managed via Supabase CLI.

## Migrations

- One migration per schema change. MUST create via `supabase migration new <name>` (auto timestamp).
- After writing SQL: `supabase db reset && supabase gen types --lang=typescript --local > apps/server/src/infra/database.types.ts`. Commit generated types together.
- RLS policies required on every new table — owner-only CRUD by default.
- All tables with mutable rows must have `updated_at` column + `update_updated_at()` trigger.
- Use `timestamptz` (not `timestamp`) for all time columns.
- `CREATE OR REPLACE FUNCTION` cannot remove existing parameter defaults — use `DROP FUNCTION` first.
