-- NEM-92: _en 파생 필드 전략 전면 제거
-- memories에서 엔진용 영문 필드 drop + fetch_pending_memories RPC 원문 컬럼만 반환하도록 재정의

ALTER TABLE memories DROP COLUMN body_en;
ALTER TABLE memories DROP COLUMN title_en;
ALTER TABLE memories DROP COLUMN tags_en;
ALTER TABLE memories DROP COLUMN summary_en;

DROP FUNCTION IF EXISTS fetch_pending_memories(int);

CREATE OR REPLACE FUNCTION fetch_pending_memories(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (id uuid, user_id uuid, body text, tags text[], summary text, created_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.user_id, m.body, m.tags, m.summary, m.created_at
  FROM memories m
  WHERE m.ingestion_status = 'pending'
    AND m.ingestion_retry_count < p_max_retries
    AND (m.last_ingestion_attempt IS NULL
         OR m.last_ingestion_attempt + m.ingestion_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fetch_pending_memories FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_memories TO service_role;
