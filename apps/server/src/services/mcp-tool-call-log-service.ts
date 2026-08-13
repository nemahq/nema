import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";

type SearchLogDetail = {
  query: string;
  results: Array<{ digestId: string; score: number }>;
};

type GetSourceLogDetail = {
  sourceId: string;
};

// MCP 도구 사용 로그 — 부수적인 기록이지 사용자가 기다리는 결과가 아니다.
// 저장이 실패해도 도구 응답은 정상으로 나가야 하므로 여기서 끝까지 삼킨다
// (호출부는 try/catch 없이 await만 하면 된다). 던지기(source.ingest)는 로그를
// 안 남긴다 — sources 테이블이 이미 다 답한다.
export async function logSearch(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  detail: SearchLogDetail;
}): Promise<void> {
  await insertLog({ ...args, tool: "search" });
}

export async function logGetSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  detail: GetSourceLogDetail;
}): Promise<void> {
  await insertLog({ ...args, tool: "get_source" });
}

async function insertLog(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  tool: "search" | "get_source";
  detail: SearchLogDetail | GetSourceLogDetail;
}): Promise<void> {
  const { supabase, userId, tool, detail } = args;
  try {
    const { error } = await supabase
      .from("mcp_tool_calls")
      .insert({ user_id: userId, tool, detail });
    if (error) {
      console.warn(`[mcp-tool-call-log] 로그 저장 실패 — tool=${tool}:`, error);
    }
  } catch (error) {
    console.warn(
      `[mcp-tool-call-log] 로그 저장 중 예외 — tool=${tool}:`,
      error,
    );
  }
}
