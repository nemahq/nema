-- fetch_pending_documents에 created_at 추가 + 전체 재인제스천 트리거

DROP FUNCTION IF EXISTS fetch_pending_documents(int);

CREATE OR REPLACE FUNCTION fetch_pending_documents(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (
  id uuid, user_id uuid, body text, body_en text,
  tags text[], tags_en text[], summary text, summary_en text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.user_id, d.body, d.body_en, d.tags, d.tags_en,
         d.summary, d.summary_en, d.created_at
  FROM documents d
  WHERE d.ingestion_status = 'pending'
    AND d.ingestion_retry_count < p_max_retries
    AND (d.last_ingestion_attempt IS NULL
         OR d.last_ingestion_attempt + d.ingestion_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fetch_pending_documents FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_documents TO service_role;

-- 이미 완료된 문서만 재인제스천. failed 상태는 원인이 미해결이므로 제외.
UPDATE documents SET
  ingestion_status = 'pending',
  ingestion_retry_count = 0,
  last_ingestion_attempt = NULL
WHERE ingestion_status = 'completed';

-- pgmq notify로 worker 깨우기
SELECT pgmq.send('document_sync', jsonb_build_object('type', 'notify'));
