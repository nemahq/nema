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
5. Report the result.

## Error Handling

- **"failed to connect"**: Likely IPv6 issue. Suggest the user check network or use Supabase Dashboard SQL Editor as fallback.
- **"Tenant or user not found"**: Project ref mismatch or project not fully provisioned. Verify the ref.
- **Other errors**: Show the full error output and suggest `--debug` flag for more info.

## Constraints

- This skill targets **staging only**. Production migrations are applied via CI/CD on `v*` tag push.
- Always dry-run first before applying.
- Never hardcode or log database passwords.
