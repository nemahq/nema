# Web Conventions

## Components

- One component per file. Exception: Suspense/ErrorBoundary wrapper + inner content component may share a file. Inner content component first, wrapper below.
- Components MUST NOT call tRPC hooks directly. Always wrap in a custom hook.
- Extract complex handlers as named functions instead of inline.
- Routing/branching components MUST only branch. Handlers belong inside each sub-component.
- Constant values (style objects, config arrays, static maps) MUST be defined outside the component. Only values that depend on props, state, or hooks belong inside.

### Responsibility tiers

| Tier          | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| UI-only       | Receives all data via props. No hooks for data fetching or mutation.        |
| Stateful unit | Owns a cohesive slice of state or data. May call custom hooks internally.   |
| Page          | Composes child components. NOT a state hub — does not fetch on their behalf.|

- State lives as close to the consuming UI as possible. Lift to a parent only when 2+ siblings share the same state.
- If only one child uses a piece of data, that child should own the hook call — the page should not fetch and prop-drill it down.

### Generic UI vs domain wrapper

- Reusable UI components (layout shells, input controls, tabbed containers) MUST be props-driven with no domain logic or context dependencies.
- Domain-specific behavior MUST be encapsulated in a wrapper component that composes the generic UI component internally.
  - `SidePanel` (generic resize shell) ← `ChatPanel` (chat domain wrapper)
  - `ChatInput` (generic input UI) ← `ChatComposer` (session chat domain wrapper)
  - `TabbedPanel` (generic tab UI) ← `ContentPanel` (session content domain wrapper)
- The wrapper owns hooks, context access, and derived state. The generic component receives only props.
- Parent components MUST only compose and lay out children — they MUST NOT fetch data or compute state on a child's behalf.
- Single responsibility check: if a component's hooks/state variables form 2+ independent groups (no shared variables, excluding shared utilities like `useTranslation`), extract each group into its own component.

## Hooks

- Cache manipulation functions belong in the hook that owns the query.
- Mutation hooks MUST NOT embed side effects (navigate, etc.). Callers inject them at `mutate(variables, { onSuccess })` call site.

## Analytics (PostHog)

- Server action result → track in mutation hook's `onSuccess` (only after confirmed success).
- Client-only interaction (navigation, copy, UI toggle) → track in the component handler.

## Functions

- Accept arguments as objects so each parameter's intent is clear at the call site.
- Separate filtering/transformation logic (pure) from execution (side effects).

## Naming

| Scope            | Pattern        | Example           |
| ---------------- | -------------- | ----------------- |
| Component        | PascalCase     | `UserProfile.tsx` |
| `components/ui/` | lowercase (managed by shadcn CLI) | `button.tsx` |
| Non-component    | camelCase      | `useAuth.ts`      |
| Component CSS    | kebab-case of component name | `markdown-renderer.css` for `MarkdownRenderer` |
| Env var          | `VITE_` prefix | `VITE_API_URL`    |

- Hook name = caller perspective. Name by what the caller does, not by API endpoint or DB table.
- Hook return variable: drop `use` prefix → camelCase. `useSessionList()` → `sessionList`. Array return → plural entity (`messages`).
- Component name MUST NOT repeat the parent folder name. `session/components/MessageList` — O, `session/components/SessionMessageList` — X.

## Data Fetching

### tRPC

- MUST NOT use tRPC hooks directly in components. Always wrap in a custom hook.
- One query or mutation per hook. Do not bundle multiple queries/mutations into a single hook.
- Query hook: `use{Entity}{Qualifier}` (e.g., `useSessionList`, `useSessionDetail`)
- Mutation hook: `use{Action}{Entity}` (e.g., `useCreateSession`, `useDeleteSession`)

### Loading

- Default: Suspense + `useSuspenseQuery` / `useSuspenseInfiniteQuery`. Fallback is a Spinner or minimal loading indicator.
- `isLoading` branching is allowed only when Skeleton UI is required for UX.

### Error

- All errors are globally reported to Sentry (unhandled rejections + MutationCache + ErrorBoundary). Do NOT add per-component `Sentry.captureException` unless additional context is needed.
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

## Folder Classification

### `src/` root folders

| Folder | Contains | Does NOT contain |
| --- | --- | --- |
| `app/` | App bootstrap: everything needed to initialize and run the application | — |
| `assets/` | Static files (images, icons, SVGs) | — |
| `features/` | Domain-specific business modules. Owns internal components/, hooks/, etc. | Code directly imported by other features |
| `components/` | Feature-agnostic UI components | Data fetching, business logic |
| `hooks/` | Feature-agnostic custom hooks | Feature-specific hooks |
| `lib/` | External service client wrappers (one file or folder per service) | Business logic, pure utility functions |
| `utils/` | Internal utility functions with no external service dependency | External service wrappers (→ lib/) |

### Feature internals

| Folder | When to use |
| --- | --- |
| `components/` | Feature-specific UI components |
| `hooks/` | Feature-specific custom hooks |
| `constants/` | Feature-specific constants |
| `types/` | Types shared across multiple files within the feature |
| `utils/` | Feature-specific pure functions |

### Co-location

- Keep types, constants, and type guards in the **same file** when tightly coupled.
- If used in one feature only, keep it inside that feature. Promote to `src/` root when used by 2+ features.
- Do NOT create separate `types/` or `constants/` folders. Reconsider only when 5+ files accumulate and navigation becomes difficult.

## Feature Boundary

- Split: different domain / different API resource / independent reuse unit. "Can you move this to another app as one chunk?"
- Merge: same domain / shared state or data / same UI flow.
- When ambiguous, merge first. Over-splitting is harder to undo.

## TypeScript

- `as const`: objects and arrays only. Freezes structure to readonly + literal types. Redundant on primitive `const` (already narrowed).
  - O: `const ROLES = ["admin", "user"] as const` → `readonly ["admin", "user"]`
  - X: `const MAX = 100 as const` → already `100` without `as const`
- `satisfies`: validate shape against a type while preserving inferred literal types. Use when you need both type checking AND narrow inference.
  - `{ key: "value" } satisfies Record<string, string>` → type-checked AND inferred as `{ key: "value" }`, not widened to `Record<string, string>`.
- MUST NOT use `as` type assertions to silence the compiler. Allowed only for narrowing from `unknown` after a runtime guard.
- Component props MUST be declared as a named `interface {ComponentName}Props` above the component. Inline type annotations in the function signature are forbidden.
  - Generic `Props` is forbidden — name collisions across files make refactoring error-prone.
- Component data props MUST be primitive values (string, number, boolean). Do NOT pass objects — primitive props enable effective `memo` shallow comparison and minimize re-renders. Callbacks (`on*`), render functions, and `children` are exempt.

## Design System

- Prefer weave components for UI implementation.
- Refer to `docs/design/design-system.html` only when custom UI beyond weave is needed.
- Minimize CSS `border` usage. Use `shadow` for surface elevation and separation instead.
