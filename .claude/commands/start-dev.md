# Start Dev Server

Start a development server in the background.

## Usage

- No argument → `pnpm dev` (full-stack local: web + local server)
- `web` → `pnpm dev:web` (web + staging API)
- `server` → `pnpm dev:server` (server only)
- `prod` → `pnpm dev:web:prod` (web + prod API)

## Steps

1. Parse the argument from `$ARGUMENTS`. If empty, default to `dev`.
2. Map the argument to the script:

| Argument | Script |
|----------|--------|
| _(none)_ | `pnpm dev` |
| `web` | `pnpm dev:web` |
| `server` | `pnpm dev:server` |
| `prod` | `pnpm dev:web:prod` |

3. Run the mapped script using the Bash tool with `run_in_background: true`.
4. Report which dev server was started.
