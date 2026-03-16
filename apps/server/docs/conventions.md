# Server Conventions

## Error Handling

- Use Sentry for error reporting. Do NOT use `console.error`. Exception: standalone scripts (`eval/`).
- Distinguish expected errors (config missing) from unexpected errors. Only swallow expected ones; report the rest via `Sentry.captureException` + logger.
- Cleanup failures (e.g., `session.close()`) MUST be logged as Sentry warning, not thrown — preserve the original error.
- Batch processing: individual item errors MUST NOT abort the entire loop. Wrap each item's error handling independently.

## TypeScript

- External data (Neo4j records, Supabase responses) MUST use runtime type guards instead of `as` assertions.
- Import `TypedSupabaseClient` from `@server/infra/supabase`. Do NOT import bare `SupabaseClient` from `@supabase/supabase-js`.

## Architecture

- Routers are thin: input validation + service call only. MUST NOT contain business logic, orchestration, or direct infra calls.
- Services own orchestration. Each service method calls infra clients directly — routers MUST NOT fetch data and pass it into services.
- Infra clients isolate external dependencies. Services MUST NOT construct HTTP requests, raw queries, or SDK calls directly — always go through infra.
- Single responsibility check: if a function's variables/calls form 2+ independent groups (no shared variables), extract each group into its own function or module.

## Functions

- Use object parameter pattern when a function has 3+ parameters.

## Testing

- Use constructor injection for mocking. Do NOT use `as any` to override private fields.
- Assert error handling via Sentry mock (`vi.mock("@sentry/node")`), not `console.error` spy.
