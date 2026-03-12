# @nema-io/web

React 19 + Vite 6 frontend. TanStack Router + TanStack Query.

## Do NOT

- Call external APIs directly. All API calls go through tRPC client. Exception: Supabase Auth client SDK (sign-in, sign-up, session management).
- Cross-feature imports. Enforced by `eslint-plugin-boundaries`.

## Directory Structure

```
src/
├── app/          # Entry point (providers/, router)
├── features/     # Business domain modules (capture, library, auth)
├── components/   # Feature-agnostic shared UI (ui/, layout/)
├── lib/          # External service clients (folder per service: tolgee/, tailwind/)
├── utils/        # Internal utilities (localStorage, theme, serialization)
└── hooks/        # Feature-agnostic shared hooks
```

- `features/` contain `components/`, `hooks/` internally. Extend as needed.
- Promote to `components/` or `hooks/` when used by 2+ features.

## State Management

- Server state: TanStack Query (tRPC integration deferred to feature implementation)
- UI state: React built-ins (useState, useContext)

## Conventions

- MUST follow rules in `docs/conventions.md`.

## I18n

- Tolgee (`@tolgee/react`). Use `t()` from `useTranslation()` hook. Do NOT use `<T>` component.
- Locale JSON in `lib/tolgee/`. Key types auto-inferred from `ko.json`.
- Key naming: first segment = feature (e.g. `common.home`, `auth.login`).
- Initial locale: localStorage → browser detection → `ko`. Runtime switch: `changeLocale()`.
- Production: staticData bundle. No in-context editing.

## Storage

- All localStorage keys centrally managed via `StorageMap` type in `utils/`.
- Access only through `getStorage()` / `setStorage()`. Direct `localStorage` calls prohibited.

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
