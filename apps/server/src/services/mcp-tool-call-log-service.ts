import type { Database } from "@server/infra/supabase/database.types";
import { getSupabaseAdmin } from "@server/infra/supabase/supabase";

type McpTool = Database["public"]["Enums"]["mcp_tool"];

type LogEntry =
  | {
      tool: "search_digests";
      detail: {
        query: string;
        results: Array<{ digestId: string; score: number }>;
      };
    }
  | { tool: "get_source"; detail: { sourceId: string } }
  | { tool: "get_relations"; detail: { digestId: string } }
  | { tool: "get_digest"; detail: { digestId: string } };

// MCP 도구 사용 로그 — 부수적인 기록이지 사용자가 기다리는 결과가 아니다.
// 유저 데이터가 아니라 서버가 스스로 남기는 텔레메트리라 admin 클라이언트로 쓴다 —
// mcp_tool_calls에는 authenticated용 INSERT 정책이 없다(마이그레이션 참고).
// 저장이 실패해도 도구 응답은 정상으로 나가야 하므로 여기서 끝까지 삼킨다
// (호출부는 try/catch 없이 fire-and-forget으로 부르면 된다). 던지기(source.ingest)는
// 로그를 안 남긴다 — sources 테이블이 이미 다 답한다.
export async function logSearch(args: {
  userId: string;
  detail: Extract<LogEntry, { tool: "search_digests" }>["detail"];
}): Promise<void> {
  await insertLog({
    userId: args.userId,
    tool: "search_digests",
    detail: args.detail,
  });
}

export async function logGetSource(args: {
  userId: string;
  detail: Extract<LogEntry, { tool: "get_source" }>["detail"];
}): Promise<void> {
  await insertLog({
    userId: args.userId,
    tool: "get_source",
    detail: args.detail,
  });
}

export async function logGetRelations(args: {
  userId: string;
  detail: Extract<LogEntry, { tool: "get_relations" }>["detail"];
}): Promise<void> {
  await insertLog({
    userId: args.userId,
    tool: "get_relations",
    detail: args.detail,
  });
}

export async function logGetDigest(args: {
  userId: string;
  detail: Extract<LogEntry, { tool: "get_digest" }>["detail"];
}): Promise<void> {
  await insertLog({
    userId: args.userId,
    tool: "get_digest",
    detail: args.detail,
  });
}

async function insertLog(args: { userId: string } & LogEntry): Promise<void> {
  const { userId, tool, detail } = args;
  try {
    const { error } = await getSupabaseAdmin()
      .from("mcp_tool_calls")
      .insert({ user_id: userId, tool: tool satisfies McpTool, detail });
    if (error) {
      console.warn(
        `[mcp-tool-call-log] 로그 저장 실패 — tool=${tool}, userId=${userId}:`,
        error,
      );
    }
  } catch (error) {
    console.warn(
      `[mcp-tool-call-log] 로그 저장 중 예외 — tool=${tool}, userId=${userId}:`,
      error,
    );
  }
}
