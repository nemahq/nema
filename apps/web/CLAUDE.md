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

## React

- `useEffect` callbacks MUST be named functions (not anonymous arrows).
- Async operations inside `useEffect` MUST use async/await (not `.then()` chains). Use Promise only when async/await cannot express the logic.

## Responsive

- Desktop-first design. Base styles = mobile, `md:` = desktop (follows Tailwind mobile-first direction).
- MUST use only `md:` (768px) breakpoint. Tablet gets desktop layout.
- MUST NOT use `sm:`, `lg:`, `xl:`, `2xl:` in project code (shadcn internals exempt).

## I18n

- Tolgee (`@tolgee/react`). 번역 컴포넌트: `<T keyName="..." defaultValue="..." />`.
- 키 네이밍: 첫 segment = feature (e.g. `common.home`, `auth.login`).
- 프로덕션: staticData 번들. 인컨텍스트 편집 미사용.

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
