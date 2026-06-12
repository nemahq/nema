-- 엔진(LLM/임베딩)용 영문 필드 추가 — 사용자 노출용 원문과 분리
ALTER TABLE memories ADD COLUMN body_en    text;
ALTER TABLE memories ADD COLUMN title_en   text;
ALTER TABLE memories ADD COLUMN tags_en    text[];
ALTER TABLE memories ADD COLUMN summary_en text;

-- fetch_pending_memories: _en 필드 포함으로 재정의
DROP FUNCTION IF EXISTS fetch_pending_memories(int);

CREATE OR REPLACE FUNCTION fetch_pending_memories(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (id uuid, user_id uuid, body text, body_en text, tags text[], tags_en text[], summary text, summary_en text, created_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.user_id, m.body, m.body_en, m.tags, m.tags_en, m.summary, m.summary_en, m.created_at
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
