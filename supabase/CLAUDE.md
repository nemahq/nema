# Supabase

PostgreSQL database + Auth, managed via Supabase CLI.

## Migrations

- One migration per schema change. MUST create via `supabase migration new <name>` (auto timestamp).
- After writing SQL: `supabase db reset`, then `pnpm supabase:gen-types`. Commit generated types together. The script pins the CLI version and runs prettier so the output matches CI's drift check — do NOT hand-run raw `supabase gen types` (version/format drift blows up the diff).
- RLS policies required on every new table — owner-only CRUD by default.
- All tables with mutable rows must have `updated_at` column + `update_updated_at()` trigger.
- Use `timestamptz` (not `timestamp`) for all time columns.
- `CREATE OR REPLACE FUNCTION` cannot remove existing parameter defaults — use `DROP FUNCTION` first.
