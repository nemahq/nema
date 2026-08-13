-- =============================================================
-- mcp-usage-log 슬라이스: mcp_tool_calls 신설
--
-- 이번 MVP 라운드는 "값이 있다"를 증명 못 한다(사용자 1~2명, 일주일). 대신
-- "값이 없다"는 즉시 드러나게 하는 게 목표다 — 그 창이 이 로그다.
--
-- 로그 후보를 규칙 둘로 걸렀다: ① DB에 이미 있는 값(던지기 횟수·재추출·다이제스트
-- 수·원문 길이 — sources·digests가 이미 답한다)은 안 담는다. ② 나중에 다시 잴 수
-- 있는 값(소요 시간·호출 비용)도 지금 안 남긴다. 남는 건 "몇 번 물었나 · 뭐라고
-- 물었나 · 그때 점수가 얼마였나 · 원문을 봤나"뿐이다.
--
-- 던지기(source.ingest)는 로그를 안 남긴다 — sources 테이블이 이미 다 답한다.
-- =============================================================

-- MCP 서버(apps/mcp/src/server.ts)에 등록된 도구 이름과 1:1로 맞춘다 — 도구가
-- 늘어날 때 이름을 새로 매핑해서 외울 필요가 없게.
CREATE TYPE mcp_tool AS ENUM ('search_digests', 'get_source');

CREATE TABLE mcp_tool_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool        mcp_tool NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  detail      jsonb NOT NULL,
  -- 이 테이블은 뷰 3개가 detail을 jsonb_array_elements 등으로 직접 펼쳐서 읽는다 —
  -- 형태가 어긋난 행 하나가 들어오면 그 순간부터 뷰 SELECT 자체가 죽는다. 아래에서
  -- 쓰기를 서버 admin 클라이언트로만 열어 클라이언트발 오염은 막지만, 서버 코드
  -- 버그로 잘못된 모양이 들어가는 것까지 잡아내라고 제약을 겹으로 둔다.
  CONSTRAINT mcp_tool_calls_detail_shape CHECK (
    CASE tool
      WHEN 'search_digests' THEN jsonb_typeof(detail -> 'results') = 'array'
      WHEN 'get_source' THEN detail ? 'sourceId'
    END
  )
);

COMMENT ON TABLE mcp_tool_calls IS
  'MCP 도구 호출 로그. tool=search_digests의 detail은 { query, results: [{ digestId, score }] } —
   results는 벡터 검색이 찾은 전체 hits가 아니라 실제로 사용자에게 반환된 것이다.
   tool=get_source의 detail은 { sourceId }. 결과 건수는 컬럼으로 안 담는다 — results
   배열 길이로 나온다. 요청 limit도 안 담는다 — 지금 이 프로시저를 부르는 유일한
   경로인 MCP 도구가 limit을 노출하지 않아 항상 상수(10)로 나오기 때문이다. 다른
   호출 경로(예: 웹)가 생기면 이 전제가 깨지므로 그때 다시 봐야 한다.';

-- v_search_log·v_search_results가 시간순 스캔+user 필터로 이 인덱스를 그대로 탄다.
CREATE INDEX idx_mcp_tool_calls_user_created ON mcp_tool_calls (user_id, created_at DESC);

-- =============================================================
-- RLS — 읽기는 owner-only. 쓰기는 유저가 아니라 서버 자신이 남기는 텔레메트리라
-- 클라이언트 정책을 아예 안 연다(서비스 레이어가 admin 클라이언트로 쓴다) — 로그인만
-- 하면 누구나 PostgREST로 임의의 detail을 밀어넣어 지표를 조작하거나 위 CHECK를
-- 우회한 값으로 뷰를 깨뜨릴 수 있는 경로를 원천 차단한다. update·delete 정책도
-- 없다 — 앱이 로그를 고치거나 지우지 않는 append-only 기록이다.
-- =============================================================

ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_tool_calls_owner_select" ON mcp_tool_calls
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
