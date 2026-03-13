-- =============================================================
-- Migration: PGMQ 건별 트리거 → pending-cycle 배치 전환
-- =============================================================

-- 배치 처리용 컬럼 추가
ALTER TABLE documents ADD COLUMN ingestion_retry_count int NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN last_ingestion_attempt timestamptz;

-- =============================================================
-- Business RPC: p_entities 제거, PGMQ 경량 트리거로 전환
-- =============================================================

-- 기존 시그니처 drop (파라미터 수 변경)
DROP FUNCTION IF EXISTS create_document_with_event(uuid, text, text[], text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS update_document_with_event(uuid, uuid, text, text[], text, text, jsonb);

CREATE OR REPLACE FUNCTION create_document_with_event(
  p_user_id    uuid,
  p_title      text,
  p_tags       text[],
  p_summary    text,
  p_body       text,
  p_session_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_doc_id uuid;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  INSERT INTO documents (user_id, title, tags, summary, body, ingestion_status)
  VALUES (p_user_id, p_title, p_tags, p_summary, p_body, 'pending')
  RETURNING id INTO v_doc_id;

  INSERT INTO session_documents (session_id, document_id)
  VALUES (p_session_id, v_doc_id)
  ON CONFLICT DO NOTHING;

  PERFORM pgmq.send('document_sync', jsonb_build_object('type', 'notify'));

  RETURN v_doc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION update_document_with_event(
  p_doc_id   uuid,
  p_user_id  uuid,
  p_title    text,
  p_tags     text[],
  p_summary  text,
  p_body     text
)
RETURNS void AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  UPDATE documents
  SET title                  = p_title,
      tags                   = p_tags,
      summary                = p_summary,
      body                   = p_body,
      ingestion_status       = 'pending',
      ingestion_retry_count  = 0,
      last_ingestion_attempt = NULL
  WHERE id = p_doc_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found or not owned by user';
  END IF;

  PERFORM pgmq.send('document_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- ack_sync_event: 단순화 — PGMQ 아카이브만 (상태 업데이트 제거)
-- =============================================================

DROP FUNCTION IF EXISTS ack_sync_event(bigint, uuid);

CREATE OR REPLACE FUNCTION ack_sync_event(p_msg_id bigint)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.archive('document_sync', p_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- nack_sync_event 제거 (retry는 ingestion_retry_count로 관리)
DROP FUNCTION IF EXISTS nack_sync_event(bigint, uuid);

-- =============================================================
-- Worker RPC: 배치 처리용 함수
-- =============================================================

CREATE OR REPLACE FUNCTION fetch_pending_documents(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (id uuid, user_id uuid, body text, tags text[], summary text) AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.user_id, d.body, d.tags, d.summary
  FROM documents d
  WHERE d.ingestion_status = 'pending'
    AND d.ingestion_retry_count < p_max_retries
    AND (d.last_ingestion_attempt IS NULL
         OR d.last_ingestion_attempt + d.ingestion_retry_count * interval '30 seconds' < now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION increment_ingestion_retry(
  p_doc_id uuid,
  p_max_retries int DEFAULT 5
)
RETURNS void AS $$
BEGIN
  UPDATE documents
  SET ingestion_retry_count = ingestion_retry_count + 1,
      last_ingestion_attempt = now(),
      ingestion_status = CASE
        WHEN ingestion_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_doc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION create_document_with_event(uuid, text, text[], text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_document_with_event(uuid, text, text[], text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION update_document_with_event(uuid, uuid, text, text[], text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_document_with_event(uuid, uuid, text, text[], text, text) TO authenticated;

REVOKE ALL ON FUNCTION fetch_pending_documents FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_documents TO service_role;

REVOKE ALL ON FUNCTION increment_ingestion_retry FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_ingestion_retry TO service_role;
