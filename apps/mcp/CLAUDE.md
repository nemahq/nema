# @nema-io/mcp

MCP server. A thin proxy over tRPC — no auth logic of its own; the user's access token is forwarded as-is, and user/space resolution and validation are handled by `apps/server`'s `protectedProcedure`.

## Tool Title/Description Style

- Write in English. MCP tool descriptions are not i18n'd — the server registers tools statically at connection time, before it knows the user's language. It's Korean-or-English, not both, so default to whichever costs nothing to switch away from later: English.
- Description structure: what it does → (if it could be confused with another tool) when to use it → (if it could be misused) when not to.
- Default to 1–2 sentences. Go longer only when ① it could be confused with another tool, ② it has a prerequisite the caller must know, or ③ the user's intent is implicit and Claude has to infer whether to call it at all (e.g. `ingest_source`).
- `title` and the tool name are not the same thing. `title` is the human-facing label — short, verb + resource. The tool name is a contract: `mcp_tool_calls.tool` is an enum, so renaming it needs a migration and leaves already-collected metrics under the old name. The verb in the name and in `title` are allowed to diverge (`ingest_source` ↔ `Capture Source`).

## Observability

Sentry is not wired into this app (only `apps/server` has it) — a thin proxy has few errors of its own. Add it if that stops being true.
