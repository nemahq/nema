# Supabase Migration Push (Staging)

Push pending migrations to the staging Supabase environment.

## Staging Project

- Project Ref: `iydatypmzqconlcqljbj`

## Steps

1. Run `npx supabase link --project-ref iydatypmzqconlcqljbj` from the repo root.
   - If link fails, troubleshoot: check `npx supabase` is available, retry once.
2. Run `npx supabase db push --linked --dry-run` to preview pending migrations.
   - If no pending migrations, report and stop.
3. Show the migration list and ask the user to confirm.
4. Run `npx supabase db push --linked` to apply.
5. **Verify functions redefined by 2+ migrations actually match the latest file.** `migration list`/`db push` only track which migration *versions* have been recorded as applied — they do not confirm the live function body matches. If any migration just pushed contains `CREATE OR REPLACE FUNCTION <name>` and that same function name is also defined in one or more *other* migration files (parallel branches merged with interleaved timestamps can apply an older redefinition after a newer one — see `nema-pm-decision-log.md`'s migration-ordering hazard), run `npx supabase db dump --linked --schema public -f <tmp-file>` and grep the dumped body for that function; diff it against the latest local migration file's version of the same function. If they don't match, the live DB has drifted from a stale earlier redefinition — create a new migration (new timestamp, later than the highest currently-applied version) that re-applies the correct, already-reviewed function body, then push and re-verify via another dump.
6. Report the result.

## Error Handling

- **"failed to connect"**: Likely IPv6 issue. Suggest the user check network or use Supabase Dashboard SQL Editor as fallback.
- **"Tenant or user not found"**: Project ref mismatch or project not fully provisioned. Verify the ref.
- **Other errors**: Show the full error output and suggest `--debug` flag for more info.

## Constraints

- This skill targets **staging only**. Production migrations are applied via CI/CD on `v*` tag push.
- Always dry-run first before applying.
- Never hardcode or log database passwords.
