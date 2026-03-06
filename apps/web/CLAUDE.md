# @nema-io/web

React 19 + Vite 6 frontend. TanStack Router + TanStack Query.

## Do NOT

- Call external APIs directly. All API calls go through tRPC client.
- Cross-feature imports. Enforced by `eslint-plugin-boundaries`.

## Directory Structure

```
src/
├── app/          # Entry point (providers/, router)
├── features/     # Business domain modules (capture, library, auth)
├── components/   # Feature-agnostic shared UI (ui/, layout/)
├── lib/          # External service clients (tRPC, Supabase)
└── hooks/        # Feature-agnostic shared hooks
```

- `features/` contain `components/`, `hooks/` internally. Extend as needed.
- Promote to `components/` or `hooks/` when used by 2+ features.

## State Management

- Server state: TanStack Query (tRPC 통합은 feature 구현 시 도입)
- UI state: React built-ins (useState, useContext)

## Naming

| Scope         | Pattern        | Example           |
| ------------- | -------------- | ----------------- |
| Component     | PascalCase     | `UserProfile.tsx` |
| `components/ui/` | lowercase (shadcn CLI 관리) | `button.tsx` |
| Non-component | camelCase      | `useAuth.ts`      |
| Env var       | `VITE_` prefix | `VITE_API_URL`    |

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
