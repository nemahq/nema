# Supabase

PostgreSQL database + Auth, managed via Supabase CLI.

## Migrations

- One migration per schema change. MUST create via `supabase migration new <name>` (auto timestamp).
- After writing SQL: `supabase db reset`, then `pnpm supabase:gen-types`. Commit generated types together. The script pins the CLI version and runs prettier so the output matches CI's drift check — do NOT hand-run raw `supabase gen types` (version/format drift blows up the diff).
- RLS policies required on every new table — owner-only CRUD by default.
- All tables with mutable rows must have `updated_at` column + `update_updated_at()` trigger.
- Use `timestamptz` (not `timestamp`) for all time columns.
- `CREATE OR REPLACE FUNCTION` cannot remove existing parameter defaults — use `DROP FUNCTION` first.

## Local Stack

- One shared stack across all worktrees — `project_id` and ports are fixed in `config.toml`, so `supabase db reset` in any worktree wipes everyone's local data and swaps the schema. Confirm before resetting.
- To isolate a worktree: temporarily change `project_id` AND all six `port` values in `config.toml` (containers are namespaced by `project_id` — changing ports alone collides), then `git checkout supabase/config.toml` when done. Both accept `"env(VAR)"` (quotes required), so this can be scripted.
- `*.integration.test.ts` hardcode the DB URL as `127.0.0.1:54322` — an isolated stack needs the same port edit there.
- Isolated stacks also only need the containers the task actually exercises — start with the same `-x` pattern as Local Auth below (or narrower: migration/view checks need only `db`, via `psql` directly, no `supabase start` at all). Running a second full stack alongside the shared one starves both on CPU/memory and their health checks start failing.

## Local Auth (Magic Link)

- `pnpm dev:local` points Auth at local Supabase (`supabase start -x vector,imgproxy,edge-runtime,logflare,studio` — the excluded services aren't needed for Auth/DB and `edge-runtime` fails to start under Colima). Signup emails are not sent — they land in Mailpit (http://127.0.0.1:54324, web UI + REST API).
- Extract a magic link without the browser: `curl "http://127.0.0.1:54324/api/v1/search?query=to:<email>"` for the message ID, then `curl "http://127.0.0.1:54324/api/v1/message/<id>"` and pull the sign-in URL from the HTML body.
- Google OAuth has no local equivalent (external console setup) — magic link only for local dev.
