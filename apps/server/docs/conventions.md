# Server Conventions

## Error Handling

- Use Sentry for error reporting. Do NOT use `console.error`. Exception: standalone scripts (`eval/`).
- Distinguish expected errors (config missing) from unexpected errors. Only swallow expected ones; report the rest via `Sentry.captureException` + logger.
- Cleanup failures (e.g., `session.close()`) MUST be logged as Sentry warning, not thrown — preserve the original error.
- Batch processing: individual item errors MUST NOT abort the entire loop. Wrap each item's error handling independently.

## TypeScript

- External data (Neo4j records, Supabase responses) MUST use runtime type guards instead of `as` assertions.
- Import `TypedSupabaseClient` from `@server/infra/supabase`. Do NOT import bare `SupabaseClient` from `@supabase/supabase-js`.

## Functions

- Use object parameter pattern when a function has 3+ parameters.

## Testing

- Use constructor injection for mocking. Do NOT use `as any` to override private fields.
- Assert error handling via Sentry mock (`vi.mock("@sentry/node")`), not `console.error` spy.
