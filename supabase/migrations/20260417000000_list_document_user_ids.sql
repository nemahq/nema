-- 엔티티 orphan prune 배치에서 사용자 목록 조회용 RPC.
-- documents 테이블 전수 scan 대신 DB 측 DISTINCT로 응답 크기 최소화.

CREATE OR REPLACE FUNCTION list_document_user_ids()
RETURNS TABLE (user_id uuid) AS $$
  SELECT DISTINCT d.user_id FROM documents d;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION list_document_user_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_document_user_ids() TO service_role;
