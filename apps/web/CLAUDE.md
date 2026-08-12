# @nema-io/web

React 19 + Vite 6 frontend. TanStack Router + TanStack Query.

## Do NOT

- Call external APIs directly. All API calls go through tRPC client. Exception: Supabase Auth client SDK (sign-in, sign-up, session management), Tolgee CDN (translation fetch).
- Cross-feature imports except through public API (`index.ts`). Enforced by `eslint-plugin-boundaries`.
- Add route/auth-dependent providers to `AppProviders`. Only route- and auth-agnostic infrastructure providers belong there. Place scoped providers in the relevant layout.
- Put public `VITE_*` config in Railway — every `VITE_*` lives in repo `.env.{staging,production}`. Railway holds only the build-mode selector (`VITE_APP_ENV`) and platform-injected vars.

<!-- TODO: Sentry/PostHog were removed in the legacy→apps/web port (2026-08). There is currently no
     error-tracking or analytics service — console.* has no destination to avoid. Re-introduce a
     console.* policy here once an observability tool is back. -->

## Directory Structure

```
src/
├── app/          # App bootstrap (init + run)
├── features/     # Business domain modules (auth, settings, profile, digest, account)
├── components/   # Feature-agnostic shared UI (ui/, layout/)
├── lib/          # Feature-independent infrastructure (external clients + internal modules, folder per concern)
├── utils/        # Internal utilities (localStorage, theme, serialization)
└── hooks/        # Feature-agnostic shared hooks
```

- `features/` contain `components/`, `hooks/` internally. Extend as needed.
- Promote to `components/` or `hooks/` when used by 2+ features.

## State Management

- Server state: TanStack Query (tRPC integration deferred to feature implementation)
- UI state: React built-ins (useState, useContext) by default.
- Server state the user edits before saving (a draft) is edited in its own query cache entry, never copied into a store — see `docs/query-conventions.md` → Editable server state.
- Typing MUST stay local to the field and reach that shared value only at boundaries (focus loss, input pause, structural action, unmount). Per-keystroke writes re-render every subscriber of the shared value. `beforeunload` is not a real boundary unless the destination survives the page unload (e.g. `localStorage`) — flushing into an in-memory cache right before the page dies commits nothing.
- zustand ONLY when a shared slice meets BOTH: (1) it cannot be colocated in one component because siblings mutate each other, AND (2) consumers need to subscribe to disjoint parts — the case Context cannot express, since any change re-renders every consumer.
- zustand stores MUST be per-screen instances (`createStore` + Context injection), never module-level singletons — the store dies with the screen, so there is no manual reset/cleanup.
- Store state MUST be derived by pure functions kept in their own file; the store only holds state and dispatches.

## Conventions

- MUST follow rules in `docs/conventions.md`.

## UI Components

- Check `@nema-io/weave` for an existing component before writing raw DOM. Decision guide: `docs/guides/weave-usage.md`.

## I18n

- MUST follow UX writing rules in `docs/guides/ux-writing.md` when adding or modifying translation keys.
- Tolgee (`@tolgee/react`). Use `t()` from `useTranslation()` hook. Do NOT use `<T>` component.
- Locale JSON in `lib/tolgee/`. Key types auto-inferred from `ko.json`.
- Key naming: first segment = feature (e.g. `common.home`, `auth.login`).
- Initial locale: localStorage → browser detection → `ko`. Runtime switch: `changeLocale()`.
- Production: CDN fetch (`VITE_TOLGEE_CDN_URL`) + local JSON fallback. Falls back to staticData only when CDN URL is not set.
- Translation workflow: edit local JSON (SSOT) → CI pushes to Tolgee on main merge. Tolgee is a read-only mirror + CDN.

## Storage

- All localStorage keys centrally managed via `StorageMap` type in `utils/`.
- Access only through `getStorage()` / `setStorage()`. Direct `localStorage` calls prohibited.

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
