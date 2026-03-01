# @nema-io/web

React 19 + Vite 6 frontend.

## Do NOT

- Call external APIs directly. All API calls go through tRPC client.

## Entry Points

- `index.html` — Vite entry. Script tag loads `src/main.tsx`.
- `src/main.tsx` — React root mount.
- `src/App.tsx` — Root component.

## Naming

| Scope | Pattern | Example |
|-------|---------|---------|
| Component | PascalCase | `UserProfile.tsx` |
| Non-component | kebab-case | `use-auth.ts` |
| Env var | `VITE_` prefix | `VITE_API_URL` |

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
