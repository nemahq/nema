-- =============================================================
-- save-engine-v2 1/6: 합성 문서 시절(v1) 테이블·enum·큐·RPC 드랍
-- 진술 기반 새 스키마(2~6층)를 세우기 전 정리. 출시 전이라 데이터 폐기 가능.
-- 보존: ingestion_status enum, update_updated_at(), sessions(messages 컬럼 포함)/profiles/events
-- =============================================================

-- ----- RPC 드랍 (테이블·enum보다 먼저 — 시그니처가 update_type 등에 의존) -----

DROP FUNCTION IF EXISTS create_memory_with_revision(uuid, uuid, text, text, text[], text, text);
DROP FUNCTION IF EXISTS update_memory_with_revision(uuid, uuid, uuid, text, text, text[], text, text, update_type);
DROP FUNCTION IF EXISTS _write_memory_revision(uuid, uuid, uuid, text, text, text[], text, text, update_type, revision_source, text);
DROP FUNCTION IF EXISTS apply_propagated_revision(uuid, uuid, uuid, text, text, text[], text, text, update_type);
DROP FUNCTION IF EXISTS apply_save_pipeline(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS fetch_pending_memories(int);
DROP FUNCTION IF EXISTS complete_memory_ingestion(uuid);
DROP FUNCTION IF EXISTS increment_memory_ingestion_retry(uuid, int);
DROP FUNCTION IF EXISTS list_memory_user_ids();
DROP FUNCTION IF EXISTS get_unique_tags(uuid);
DROP FUNCTION IF EXISTS fail_stale_save_jobs();
DROP FUNCTION IF EXISTS link_draft_to_history(uuid, uuid);
DROP FUNCTION IF EXISTS send_memory_sync_notify(int);
-- 큐 소비 RPC는 memory_sync 전용이라 함께 드랍 — 6층에서 statement_sync용으로 재생성
DROP FUNCTION IF EXISTS read_sync_events(int, int);
DROP FUNCTION IF EXISTS ack_sync_event(bigint);

-- ----- 테이블 드랍 -----
-- 의존 역순. save_jobs.history_id → histories FK 때문에 save_jobs를 histories보다 먼저 내린다.

DROP TABLE IF EXISTS memory_revisions;
DROP TABLE IF EXISTS save_jobs;
DROP TABLE IF EXISTS histories;
DROP TABLE IF EXISTS memories;

-- ----- 전용 enum 드랍 (ingestion_status는 보존 — v2의 추출·임베딩 상태로 재사용) -----

DROP TYPE IF EXISTS update_type;
DROP TYPE IF EXISTS revision_source;
DROP TYPE IF EXISTS save_job_status;

-- ----- PGMQ: memory_sync 큐 드랍 -----

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'memory_sync') THEN
    PERFORM pgmq.drop_queue('memory_sync');
  END IF;
END $$;
