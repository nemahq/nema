---
argument-hint: [local|web|server|prod]
---

# Start Dev Server

Start a development server in the background.

## Usage

- No argument → `pnpm dev` (full-stack local: web + local server)
- `web` → `pnpm dev:web` (web + staging API)
- `server` → `pnpm dev:server` (server only)
- `prod` → `pnpm dev:web:prod` (web + prod API)

## Steps

1. Parse the argument from `$ARGUMENTS`.
2. Infer the canonical argument using fuzzy matching. Accept synonyms and partial matches:

| Canonical | Accepted inputs (case-insensitive) |
|-----------|-------------------------------------|
| _(none)_  | empty, `local`, `full`, `all`, `fullstack`, `full-stack` |
| `web`     | `web`, `staging`, `stg`, `front`, `frontend` |
| `server`  | `server`, `api`, `back`, `backend` |
| `prod`    | `prod`, `production`, `web:prod` |

If the input doesn't match any synonym, report the unrecognized argument and list the valid options. Do NOT proceed.

3. Map the canonical argument to the script:

| Canonical | Script |
|-----------|--------|
| _(none)_  | `pnpm dev` |
| `web`     | `pnpm dev:web` |
| `server`  | `pnpm dev:server` |
| `prod`    | `pnpm dev:web:prod` |

4. Before starting, kill any existing process on the target port(s). Do NOT ask the user — just kill it silently.

| Canonical | Port(s) to free |
|-----------|-----------------|
| _(none)_  | 5173, 3000      |
| `web`     | 5173            |
| `server`  | 3000            |
| `prod`    | 5173            |

Run `lsof -ti:<port> | xargs kill -9 2>/dev/null` for each port. Ignore errors (no process = nothing to kill).

5. Run the mapped script using the Bash tool with `run_in_background: true`.
6. Wait 3 seconds, then read the background task output to extract the port/URL (e.g., `localhost:5173`).
7. Report which dev server was started and the local URL with port.
