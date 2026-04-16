-- =============================================================
-- Migration: documents 관련 테이블·RPC 제거
-- CBT 전 — 기존 데이터 마이그레이션 없이 삭제
-- =============================================================

-- ----- RPC 제거 -----
DROP FUNCTION IF EXISTS create_document_with_event(uuid, text, text[], text, text, uuid, text, text[], text, text);
DROP FUNCTION IF EXISTS update_document_with_event(uuid, uuid, text, text[], text, text, text, text[], text, text);
DROP FUNCTION IF EXISTS delete_document_with_event(uuid, uuid);
DROP FUNCTION IF EXISTS fetch_pending_documents(int);
DROP FUNCTION IF EXISTS increment_ingestion_retry(uuid, int);
DROP FUNCTION IF EXISTS list_document_user_ids();

-- ----- 테이블 제거 (의존성 순서: session_documents → documents) -----
DROP TABLE IF EXISTS session_documents;
DROP TABLE IF EXISTS documents;

-- ----- PGMQ: document_sync 큐 제거 -----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'document_sync') THEN
    PERFORM pgmq.drop_queue('document_sync');
  END IF;
END $$;
