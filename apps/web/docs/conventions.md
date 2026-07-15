# Web Conventions

## Components

- One component per file. Exception: Suspense/ErrorBoundary wrapper + inner content component may share a file. Inner content component first, wrapper below.
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
- Hooks MAY return objects containing `ReactNode` fields when the return type is a named interface. Hooks MUST NOT return raw JSX — if the primary purpose is rendering, use a component.

## Analytics (PostHog)

- Server action result → track in mutation hook's `onSuccess` (only after confirmed success).
- Client-only interaction (navigation, copy, UI toggle) → track in the component handler.

## Functions

- Separate filtering/transformation logic (pure) from execution (side effects).
- Extract formatting/transformation logic into named functions when it obscures the surrounding control flow.

## Naming

| Scope            | Pattern        | Example           |
| ---------------- | -------------- | ----------------- |
| Component        | PascalCase     | `UserProfile.tsx` |
| Non-component    | camelCase      | `useAuth.ts`      |
| Component CSS    | kebab-case of component name | `markdown-renderer.css` for `MarkdownRenderer` |
| Env var          | `VITE_` prefix | `VITE_API_URL`    |

- Hook name = caller perspective. Name by what the caller does, not by API endpoint or DB table.
- Hook return variable: drop `use` prefix → camelCase. `useSessionList()` → `sessionList`. Array return → plural entity (`messages`).
- Component name MUST NOT repeat the parent folder name. `session/components/MessageList` — O, `session/components/SessionMessageList` — X.
- Generic names like `value`, `data`, `item` MUST NOT be used for variables. Use domain-specific names that convey intent (e.g., `inputValue` → `messageInput`, `data` → `sessionDetail`).

## Data Fetching

- MUST follow rules in `docs/query-conventions.md`.

### tRPC

- One query or mutation per hook. Do not bundle multiple queries/mutations into a single hook.
- Query hook: `use{Entity}{Qualifier}` (e.g., `useSessionList`, `useSessionDetail`)
- Mutation hook: `use{Action}{Entity}` (e.g., `useCreateSession`, `useDeleteSession`)

### Loading

- **Default is Suspense.** Use `useSuspenseQuery` / `useSuspenseInfiniteQuery` and let the component suspend. The main content area (`<Outlet>`) already has a shared Suspense boundary whose fallback (`ContentAreaFallback`, a watermark) is the default page-loading UI — a page that suspends into it needs **no** local `isLoading` branch and **no** local boundary.
- **A Skeleton does not justify a manual `isLoading` branch.** Extract the loading-dependent region into a child that calls `useSuspenseQuery`, and wrap that child in `<Suspense fallback={<Skeleton/>}>`. A local boundary earns its place only by keeping always-visible siblings rendered while the data-dependent region falls back — sibling chrome (headers, tabs, inputs) stays put. (`DraftDetailHeader` keeps the header, suspends only the Space pill; `TagAddPopover` keeps the search input, suspends only the results.)
- **Whole screen waits → suspend into the shared watermark, no local boundary.** If nothing renders before the data (header included), a screen-level boundary would be functionally identical to the shared one — skip it (`DraftsScreen`, `SpaceOverview`). Add a local boundary only to override the watermark with a tailored skeleton (`DigestReviewScreen`).
- **Conditional / dependent queries still suspend — gate by mounting, not `enabled`.** `useSuspenseQuery` has no `enabled: false`, so mount the suspending child only once its precondition holds: `{open && <Suspense>…}` (popover open) or `{spaceId && <Suspense>…}` (dependent on a prior query). (`TagAddPopover`, `TopicAddPopover`.)
- **Inline error UI → pair the local Suspense with a local ErrorBoundary** whose fallback renders the error, instead of letting a `useSuspenseQuery` error escalate to the route `errorComponent`. (`TagAddPopover`, `TopicAddPopover`.)
- **Manual `isLoading` / `!data` is the last resort — the one case Suspense cannot express: the loading flag drives imperative logic, not a render fork** (e.g. an `isLoading` `useEffect` dependency for enter/exit animation). Keep it manual and comment the reason. (`DraftsNavItem`.)

### Error

- All errors are globally reported to Sentry (unhandled rejections + MutationCache + ErrorBoundary). Do NOT add per-component `Sentry.captureException` unless additional context is needed.
- Mutation errors: global toast (QueryProvider). Use `onError` only when individual handling is needed.
- Query errors: handled by route `errorComponent`.
- ErrorBoundary at route level by default. Component-level only when a failure must not propagate to the entire page.
- Section background color MUST be on a container outside ErrorBoundary/Suspense. If only the inner content defines it, fallback states lose the background.

## React

- `useEffect` callbacks MUST be named functions (not anonymous arrows).
- Async operations inside `useEffect` MUST use async/await (not `.then()` chains). Use Promise only when async/await cannot express the logic.
- `useEffect` is only for external system connections (WebSocket, EventListener) and DOM manipulation.
- MUST NOT use `useEffect` for: derived state computation, event response logic, effect chaining.
- One-time impure initializers (e.g., `Math.random()`) MUST use `useState` with an initializer function: `const [x] = useState(() => impureFn())`. `useRef` initializer runs during render and violates purity rules.
- Prefer derived values over render-phase setState (`if (prop !== prev) setState(...)`). Consider derived computation, `key` prop reset, or state restructuring first. Render-phase setState is a last resort when none of those alternatives apply.

## Responsive

- Desktop-first design. Base styles = mobile, `md:` = desktop (follows Tailwind mobile-first direction).
- Tablet gets desktop layout.

## Accessibility

- Interactive elements MUST use semantic tags (button, a). div + onClick is forbidden.
- Icon-only buttons MUST have aria-label.
- MUST NOT remove focus styles.
- Focus rings MUST use `focus-visible:` (not plain `focus:`) so they only appear on keyboard access, not mouse click. The global outline (`packages/weave/src/tokens/index.css`) already covers every focusable element — components normally need zero local ring/outline classes. Exception: Radix menu item highlight states (`focus:bg-*`, `data-[highlighted]:*`) are intentional and MUST stay `focus:`/`data-*`-based, not `focus-visible:` — that highlight is arrow-key navigation feedback and must show for mouse hover too, not just keyboard access.

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
- Component data props MUST be primitive values (string, number, boolean). Do NOT pass objects — primitive props enable effective `memo` shallow comparison and minimize re-renders. Callbacks (`on*`), render functions, and `children` are exempt.

## Design System

- Prefer weave components for UI implementation.
- Where a new reusable component lives: app/brand-agnostic primitive (portable to another product) → weave; Nema-specific generic UI → `components/ui/`.
- Refer to `design/design-system.html` (repo root) only when custom UI beyond weave is needed.
- Minimize CSS `border` usage. Use `shadow` for surface elevation and separation instead.
