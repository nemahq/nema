# Web Conventions

## Components

- One component per file.
- Components only render. Data fetching, cache manipulation, and other data logic go in hooks.
- Extract complex handlers as named functions instead of inline.
- Routing/branching components MUST only branch. Handlers belong inside each sub-component.

## Hooks

- Cache manipulation functions belong in the hook that owns the query.
- Mutation hooks MUST NOT embed side effects (navigate, etc.). Callers inject them at `mutate(variables, { onSuccess })` call site.

## Functions

- Accept arguments as objects so each parameter's intent is clear at the call site.
- Separate filtering/transformation logic (pure) from execution (side effects).

## Naming

| Scope            | Pattern        | Example           |
| ---------------- | -------------- | ----------------- |
| Component        | PascalCase     | `UserProfile.tsx` |
| `components/ui/` | lowercase (managed by shadcn CLI) | `button.tsx` |
| Non-component    | camelCase      | `useAuth.ts`      |
| Env var          | `VITE_` prefix | `VITE_API_URL`    |

## Data Fetching

### tRPC

- MUST NOT use tRPC hooks directly in components. Always wrap in a custom hook.
- Query hook: `use{Entity}{Qualifier}` (e.g., `useSessionList`, `useSessionDetail`)
- Mutation hook: `use{Action}{Entity}` (e.g., `useCreateSession`, `useDeleteSession`)

### Loading

- Default: Suspense + `useSuspenseQuery` / `useSuspenseInfiniteQuery`. Fallback is a Spinner or minimal loading indicator.
- `isLoading` branching is allowed only when Skeleton UI is required for UX.

### Error

- Mutation errors: global toast (QueryProvider). Use `onError` only when individual handling is needed.
- Query errors: handled by route `errorComponent`.
- ErrorBoundary at route level by default. Component-level only when a failure must not propagate to the entire page.

## React

- `useEffect` callbacks MUST be named functions (not anonymous arrows).
- Async operations inside `useEffect` MUST use async/await (not `.then()` chains). Use Promise only when async/await cannot express the logic.
- `useEffect` is only for external system connections (WebSocket, EventListener) and DOM manipulation.
- MUST NOT use `useEffect` for: derived state computation, event response logic, effect chaining.

## Responsive

- Desktop-first design. Base styles = mobile, `md:` = desktop (follows Tailwind mobile-first direction).
- MUST use only `md:` (768px) breakpoint. Tablet gets desktop layout.
- MUST NOT use `sm:`, `lg:`, `xl:`, `2xl:` in project code (shadcn internals exempt).

## Accessibility

- Interactive elements MUST use semantic tags (button, a). div + onClick is forbidden.
- Icon-only buttons MUST have aria-label.
- MUST NOT remove focus styles.

## Feature Boundary

- Split: different domain / different API resource / independent reuse unit. "Can you move this to another app as one chunk?"
- Merge: same domain / shared state or data / same UI flow.
- When ambiguous, merge first. Over-splitting is harder to undo.

## Design System

- Prefer weave components for UI implementation.
- Refer to `docs/design/design-system.html` only when custom UI beyond weave is needed.
