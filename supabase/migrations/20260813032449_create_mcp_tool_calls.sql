-- =============================================================
-- mcp-usage-log 슬라이스: mcp_tool_calls 신설
--
-- 이번 MVP 라운드는 "값이 있다"를 증명 못 한다(사용자 1~2명, 일주일). 대신
-- "값이 없다"는 즉시 드러나게 하는 게 목표다 — 그 창이 이 로그다.
-- (scratchpad/kickoff-usage-log.md 2026-08-13)
--
-- 로그 후보를 규칙 둘로 걸렀다: ① DB에 이미 있는 값(던지기 횟수·재추출·다이제스트
-- 수·원문 길이 — sources·digests가 이미 답한다)은 안 담는다. ② 나중에 다시 잴 수
-- 있는 값(소요 시간·호출 비용)도 지금 안 남긴다. 남는 건 "몇 번 물었나 · 뭐라고
-- 물었나 · 그때 점수가 얼마였나 · 원문을 봤나"뿐이다.
--
-- 던지기(source.ingest)는 로그를 안 남긴다 — sources 테이블이 이미 다 답한다.
-- =============================================================

CREATE TYPE mcp_tool AS ENUM ('search', 'get_source');

CREATE TABLE mcp_tool_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool        mcp_tool NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  detail      jsonb NOT NULL
);

COMMENT ON TABLE mcp_tool_calls IS
  'MCP 도구 호출 로그. tool=search의 detail은 { query, results: [{ digestId, score }] } —
   results는 벡터 검색이 찾은 전체 hits가 아니라 실제로 사용자에게 반환된 것이다.
   tool=get_source의 detail은 { sourceId }. 결과 건수·요청 limit은 컬럼으로 안 담는다 —
   전자는 results 배열 길이로, 후자는 MCP 도구가 limit을 노출하지 않아 항상 상수(10)로
   나온다.';

-- v_search_log·v_search_results가 시간순 스캔+user 필터로 이 인덱스를 그대로 탄다.
CREATE INDEX idx_mcp_tool_calls_user_created ON mcp_tool_calls (user_id, created_at DESC);

-- =============================================================
-- RLS — owner-only. 앱이 로그를 고치거나 지우지 않아 select·insert만 둔다
-- (sources·digests와 같은 패턴, profiles와 같은 이유).
-- =============================================================

ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_tool_calls_owner_select" ON mcp_tool_calls
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "mcp_tool_calls_owner_insert" ON mcp_tool_calls
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
