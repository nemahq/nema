# Supabase

PostgreSQL database + Auth, managed via Supabase CLI.

## Migrations

- One migration per schema change. File naming: auto-generated timestamp prefix.
- RLS policies required on every new table — owner-only CRUD by default.
- All tables with mutable rows must have `updated_at` column + `update_updated_at()` trigger.
- Use `timestamptz` (not `timestamp`) for all time columns.
