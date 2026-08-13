-- =============================================================
-- digest-relations 슬라이스: MCP 도구 둘 추가
--
-- get_relations(digestId)  그 다이제스트에 붙은 관계
-- get_digest(digestId)     다이제스트 하나 전체
--
-- 꺼내기 응답에는 관계를 안 싣는다 — 10개 × 각각의 관계면 응답이 폭발하고, 자동으로
-- 딸려 오면 "관계를 실제로 얼마나 따라가나"가 로그에 안 남는다. 원문 보기(get_source)에
-- 이미 같은 원칙을 적용했다.
--
-- CHECK 제약 갱신은 다음 마이그레이션으로 뗀다 — ALTER TYPE ... ADD VALUE로 더한 값은
-- 같은 트랜잭션 안에서 못 쓴다(제약식이 새 값 리터럴을 평가하는 순간 죽는다).
-- =============================================================

ALTER TYPE mcp_tool ADD VALUE 'get_relations';
ALTER TYPE mcp_tool ADD VALUE 'get_digest';
