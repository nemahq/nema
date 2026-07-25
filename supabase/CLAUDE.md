# Supabase

PostgreSQL database + Auth, managed via Supabase CLI.

## Migrations

- One migration per schema change. MUST create via `supabase migration new <name>` (auto timestamp).
- After writing SQL: `supabase db reset`, then `pnpm supabase:gen-types`. Commit generated types together. The script pins the CLI version and runs prettier so the output matches CI's drift check — do NOT hand-run raw `supabase gen types` (version/format drift blows up the diff).
- RLS policies required on every new table — owner-only CRUD by default.
- All tables with mutable rows must have `updated_at` column + `update_updated_at()` trigger.
- Use `timestamptz` (not `timestamp`) for all time columns.
- `CREATE OR REPLACE FUNCTION` cannot remove existing parameter defaults — use `DROP FUNCTION` first.

## Local Auth (Magic Link)

- `pnpm dev:local` points Auth at local Supabase (`supabase start -x vector,imgproxy,edge-runtime,logflare,studio` — the excluded services aren't needed for Auth/DB and `edge-runtime` fails to start under Colima). Signup emails are not sent — they land in Mailpit (http://127.0.0.1:54324, web UI + REST API).
- Extract a magic link without the browser: `curl "http://127.0.0.1:54324/api/v1/search?query=to:<email>"` for the message ID, then `curl "http://127.0.0.1:54324/api/v1/message/<id>"` and pull the sign-in URL from the HTML body.
- Google OAuth has no local equivalent (external console setup) — magic link only for local dev.
