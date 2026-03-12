# Web Conventions

## Components

- One component per file.
- Components only render. Data fetching, cache manipulation, and other data logic go in hooks.
- Extract complex handlers as named functions instead of inline.

## Hooks

- Cache manipulation functions belong in the hook that owns the query.
- Mutation hooks MUST NOT embed side effects (navigate, etc.). Callers inject them at `mutate(variables, { onSuccess })` call site.

## Functions

- Accept arguments as objects so each parameter's intent is clear at the call site.

## Naming

| Scope            | Pattern        | Example           |
| ---------------- | -------------- | ----------------- |
| Component        | PascalCase     | `UserProfile.tsx` |
| `components/ui/` | lowercase (managed by shadcn CLI) | `button.tsx` |
| Non-component    | camelCase      | `useAuth.ts`      |
| Env var          | `VITE_` prefix | `VITE_API_URL`    |

## React

- `useEffect` callbacks MUST be named functions (not anonymous arrows).
- Async operations inside `useEffect` MUST use async/await (not `.then()` chains). Use Promise only when async/await cannot express the logic.

## Responsive

- Desktop-first design. Base styles = mobile, `md:` = desktop (follows Tailwind mobile-first direction).
- MUST use only `md:` (768px) breakpoint. Tablet gets desktop layout.
- MUST NOT use `sm:`, `lg:`, `xl:`, `2xl:` in project code (shadcn internals exempt).
