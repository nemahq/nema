-- =============================================================
-- digest-relations 슬라이스: mcp_tool_calls의 detail 모양 제약에 새 도구 둘을 더한다.
--
-- CASE에 분기가 없으면 결과가 NULL이고 CHECK는 NULL을 통과시킨다 — 새 도구 둘이
-- 제약 없이 뚫리는 걸 막으려면 분기를 명시해야 한다.
-- =============================================================

ALTER TABLE mcp_tool_calls DROP CONSTRAINT mcp_tool_calls_detail_shape;

ALTER TABLE mcp_tool_calls ADD CONSTRAINT mcp_tool_calls_detail_shape CHECK (
  CASE tool
    WHEN 'search_digests' THEN jsonb_typeof(detail -> 'results') = 'array'
    WHEN 'get_source' THEN detail ? 'sourceId'
    WHEN 'get_relations' THEN detail ? 'digestId'
    WHEN 'get_digest' THEN detail ? 'digestId'
  END
);

COMMENT ON TABLE mcp_tool_calls IS
  'MCP 도구 호출 로그. tool=search_digests의 detail은 { query, results: [{ digestId, score }] } —
   results는 벡터 검색이 찾은 전체 hits가 아니라 실제로 사용자에게 반환된 것이다.
   tool=get_source의 detail은 { sourceId }, get_relations·get_digest는 { digestId }.
   결과 건수는 컬럼으로 안 담는다 — results 배열 길이로 나온다. 요청 limit도 안 담는다 —
   지금 이 프로시저를 부르는 유일한 경로인 MCP 도구가 limit을 노출하지 않아 항상
   상수(10)로 나오기 때문이다. 다른 호출 경로(예: 웹)가 생기면 이 전제가 깨지므로
   그때 다시 봐야 한다.
   get_relations는 관계를 몇 개 돌려줬는지도 안 담는다 — digest_relations를 그 시점으로
   되짚으면 나오고, 여기서 보고 싶은 건 "관계를 따라가는 일이 실제로 일어나나"다.';
