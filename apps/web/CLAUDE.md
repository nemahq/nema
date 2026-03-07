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

## Responsive

- Desktop-first design. Base styles = mobile, `md:` = desktop (follows Tailwind mobile-first direction).
- MUST use only `md:` (768px) breakpoint. Tablet gets desktop layout.
- MUST NOT use `sm:`, `lg:`, `xl:`, `2xl:` in project code (shadcn internals exempt).

## I18n

- Tolgee (`@tolgee/react`) 기반. `useTranslation()` 훅의 `t()` 함수로 번역. `<T>` 컴포넌트 사용 금지.
- locale JSON: `src/lib/i18n/ko.json`, `en.json`. 키 타입은 `ko.json`에서 자동 추론.
- 키 네이밍: 첫 segment = feature (e.g. `common.home`, `auth.login`).
- locale 전환: `changeLocale()`. 우선순위: localStorage → 브라우저 감지 → `ko`.
- 프로덕션: staticData 번들. 인컨텍스트 편집 미사용.

## Storage

- localStorage 키는 `src/lib/storage.ts`에서 `StorageMap` 타입으로 중앙 관리.
- `getStorage()` / `setStorage()` 유틸리티로만 접근. 직접 `localStorage` 호출 금지.

## Dev

- `pnpm dev` — Vite dev server at :5173 (HMR).
- `pnpm test` — Vitest. Test files co-located as `*.test.tsx`.
