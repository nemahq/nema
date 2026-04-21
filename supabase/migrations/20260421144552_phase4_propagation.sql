-- Phase 4 propagation 구현
-- 1. revision_source에 'propagated' 추가 (이미 types에 반영됨)
-- 2. _write_memory_revision 헬퍼 추출 (auth 없는 순수 데이터 쓰기)
-- 3. update_memory_with_revision → 헬퍼 호출로 전환
-- 4. apply_propagated_revision 신설 (service_role 전용)
-- 5. send_memory_sync_notify 신설 (Phase 4 전파 트리거)
-- 6. fetch_pending_memories에 history_id 추가

ALTER TYPE revision_source ADD VALUE IF NOT EXISTS 'propagated';

-- =============================================================
-- _write_memory_revision: 인증 없는 순수 쓰기 헬퍼
-- =============================================================

CREATE OR REPLACE FUNCTION _write_memory_revision(
  p_memory_id   uuid,
  p_user_id     uuid,
  p_history_id  uuid,
  p_title       text,
  p_category    text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_update_type update_type,
  p_source      revision_source
)
RETURNS void AS $$
DECLARE
  v_prev_body text;
BEGIN
  SELECT body INTO v_prev_body
  FROM memories
  WHERE id = p_memory_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory % not found for user %', p_memory_id, p_user_id;
  END IF;

  UPDATE memories
  SET title                  = p_title,
      category               = p_category,
      tags                   = p_tags,
      summary                = p_summary,
      body                   = p_body,
      ingestion_status       = 'pending',
      ingestion_retry_count  = 0,
      last_ingestion_attempt = NULL
  WHERE id = p_memory_id;

  INSERT INTO memory_revisions (memory_id, history_id, prev_body, next_body, update_type, source)
  VALUES (p_memory_id, p_history_id, v_prev_body, p_body, p_update_type, p_source);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION _write_memory_revision FROM public, anon, authenticated;

-- =============================================================
-- update_memory_with_revision: 헬퍼 호출로 전환
-- =============================================================

CREATE OR REPLACE FUNCTION update_memory_with_revision(
  p_memory_id   uuid,
  p_user_id     uuid,
  p_history_id  uuid,
  p_title       text,
  p_category    text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_update_type update_type
)
RETURNS void AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM histories WHERE id = p_history_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'history not found or not owned by user';
  END IF;

  PERFORM _write_memory_revision(
    p_memory_id, p_user_id, p_history_id,
    p_title, p_category, p_tags, p_summary, p_body,
    p_update_type, 'direct'::revision_source
  );

  PERFORM pgmq.send('memory_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- apply_propagated_revision: Phase 4 전용 (service_role)
-- =============================================================

CREATE OR REPLACE FUNCTION apply_propagated_revision(
  p_memory_id   uuid,
  p_user_id     uuid,
  p_history_id  uuid,
  p_title       text,
  p_category    text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_update_type update_type
)
RETURNS void AS $$
BEGIN
  PERFORM _write_memory_revision(
    p_memory_id, p_user_id, p_history_id,
    p_title, p_category, p_tags, p_summary, p_body,
    p_update_type, 'propagated'::revision_source
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION apply_propagated_revision FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_propagated_revision TO service_role;

-- =============================================================
-- send_memory_sync_notify: Phase 4 완료 후 전파 트리거 (service_role)
-- =============================================================

CREATE OR REPLACE FUNCTION send_memory_sync_notify(p_propagation_depth int DEFAULT 0)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.send(
    'memory_sync',
    jsonb_build_object('type', 'notify', 'propagation_depth', p_propagation_depth)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION send_memory_sync_notify FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION send_memory_sync_notify TO service_role;

-- =============================================================
-- fetch_pending_memories: history_id 추가 (최신 revision subquery)
-- =============================================================

DROP FUNCTION IF EXISTS fetch_pending_memories(int);

CREATE OR REPLACE FUNCTION fetch_pending_memories(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  user_id    uuid,
  body       text,
  tags       text[],
  summary    text,
  created_at timestamptz,
  history_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.body,
    m.tags,
    m.summary,
    m.created_at,
    (SELECT r.history_id
     FROM memory_revisions r
     WHERE r.memory_id = m.id
     ORDER BY r.created_at DESC
     LIMIT 1) AS history_id
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
