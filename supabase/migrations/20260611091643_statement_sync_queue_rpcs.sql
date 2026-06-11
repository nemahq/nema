-- =============================================================
-- save-engine-v2 6/6: 동기화 — statement_sync 큐 + 추출/저장/임베딩 RPC
-- 2단계 비동기 파이프의 DB 계약. worker 실제 구현(LLM 추출, Voyage 임베딩,
-- Qdrant 클라이언트)은 후속 — 여기서는 큐·RPC·상태 컬럼 계약까지만.
--
--   글 던짐 → source 박제 (extraction_status=pending)
--     → [worker] 추출(LLM): apply_ingestion_changeset로 원자 생성, extraction completed
--       → statements (ingestion_status=pending)
--       → [worker] 임베딩(Voyage): Qdrant upsert, ingestion completed
--
-- 전부 service_role 전용 (v1의 fetch_pending_memories 류 계승).
-- =============================================================

SELECT pgmq.create('statement_sync');

-- =============================================================
-- 추출 RPC — sources.extraction_status 폴링
-- =============================================================

CREATE OR REPLACE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  space_id   uuid,
  author_id  uuid,
  session_id uuid,
  body       text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at
  FROM sources s
  WHERE s.extraction_status = 'pending'
    AND s.extraction_retry_count < p_max_retries
    AND (s.last_extraction_attempt IS NULL
         OR s.last_extraction_attempt + s.extraction_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION complete_source_extraction(p_source_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources SET extraction_status = 'completed' WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION increment_source_extraction_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET extraction_retry_count  = extraction_retry_count + 1,
      last_extraction_attempt = now(),
      error_message           = p_error_message,
      extraction_status = CASE
        WHEN extraction_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 저장 RPC — source+statements+statement_sources+changeset+changes
-- 한 트랜잭션 원자 생성. 부분 실패 없이 전체 롤백.
-- =============================================================

-- p_statements: [{ "content": text, "type": statement_type, "confidence": statement_confidence|null }]
-- source의 생성 이력은 changesets.source_id가 담당하므로 changes에는 진술 create만 기록한다.
-- 반환: { "source_id", "changeset_id", "statement_ids" }
CREATE OR REPLACE FUNCTION apply_ingestion_changeset(
  p_space_id   uuid,
  p_author_id  uuid,
  p_session_id uuid,
  p_body       text,
  p_statements jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_source_id     uuid;
  v_changeset_id  uuid;
  v_statement_id  uuid;
  v_statement_ids uuid[] := '{}';
  v_item          jsonb;
BEGIN
  -- 사람 type(ingestion)의 author 필수는 RPC가 보장 (DB는 SET NULL과 양립 위해 CHECK로 안 박음)
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'ingestion changeset requires author_id';
  END IF;

  IF jsonb_typeof(p_statements) != 'array' OR jsonb_array_length(p_statements) = 0 THEN
    RAISE EXCEPTION 'p_statements must be a non-empty JSON array';
  END IF;

  -- 진술이 함께 들어오므로 추출은 이미 끝난 상태로 박제
  INSERT INTO sources (space_id, author_id, session_id, body, extraction_status)
  VALUES (p_space_id, p_author_id, p_session_id, p_body, 'completed')
  RETURNING id INTO v_source_id;

  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (p_space_id, 'ingestion', 'applied', v_source_id, p_author_id)
  RETURNING id INTO v_changeset_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_statements)
  LOOP
    INSERT INTO statements (space_id, content, type, confidence)
    VALUES (
      p_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence
    )
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_sources (statement_id, source_id)
    VALUES (v_statement_id, v_source_id);

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'statement', v_statement_id, v_item);

    v_statement_ids := v_statement_ids || v_statement_id;
  END LOOP;

  -- 임베딩 worker 깨우기 (statements가 ingestion_status=pending으로 생성됨)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN jsonb_build_object(
    'source_id',     v_source_id,
    'changeset_id',  v_changeset_id,
    'statement_ids', to_jsonb(v_statement_ids)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 임베딩 RPC — statements.ingestion_status 폴링
-- =============================================================

-- status 포함 — 선언적 동기화: worker가 active면 Qdrant upsert, archived면 delete
CREATE OR REPLACE FUNCTION fetch_pending_statements(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  space_id   uuid,
  content    text,
  type       statement_type,
  confidence statement_confidence,
  status     statement_status,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT st.id, st.space_id, st.content, st.type, st.confidence, st.status, st.created_at
  FROM statements st
  WHERE st.ingestion_status = 'pending'
    AND st.ingestion_retry_count < p_max_retries
    AND (st.last_ingestion_attempt IS NULL
         OR st.last_ingestion_attempt + st.ingestion_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION complete_statement_ingestion(p_statement_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE statements SET ingestion_status = 'completed' WHERE id = p_statement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION increment_statement_ingestion_retry(
  p_statement_id  uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE statements
  SET ingestion_retry_count  = ingestion_retry_count + 1,
      last_ingestion_attempt = now(),
      error_message          = p_error_message,
      ingestion_status = CASE
        WHEN ingestion_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_statement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 큐 소비 RPC — statement_sync로 재생성 (1층에서 memory_sync용 드랍)
-- =============================================================

CREATE OR REPLACE FUNCTION read_sync_events(
  p_batch_size         int DEFAULT 5,
  p_visibility_timeout int DEFAULT 30
)
RETURNS TABLE (msg_id bigint, read_ct int, message jsonb) AS $$
BEGIN
  RETURN QUERY
  SELECT r.msg_id, r.read_ct, r.message
  FROM pgmq.read('statement_sync', p_visibility_timeout, p_batch_size) r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION ack_sync_event(p_msg_id bigint)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.archive('statement_sync', p_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions — 전부 service_role 전용
-- =============================================================

REVOKE ALL ON FUNCTION fetch_pending_sources FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_sources TO service_role;

REVOKE ALL ON FUNCTION complete_source_extraction FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_source_extraction TO service_role;

REVOKE ALL ON FUNCTION increment_source_extraction_retry FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_source_extraction_retry TO service_role;

REVOKE ALL ON FUNCTION apply_ingestion_changeset FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ingestion_changeset TO service_role;

REVOKE ALL ON FUNCTION fetch_pending_statements FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_statements TO service_role;

REVOKE ALL ON FUNCTION complete_statement_ingestion FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_statement_ingestion TO service_role;

REVOKE ALL ON FUNCTION increment_statement_ingestion_retry FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_statement_ingestion_retry TO service_role;

REVOKE ALL ON FUNCTION read_sync_events FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION read_sync_events TO service_role;

REVOKE ALL ON FUNCTION ack_sync_event FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION ack_sync_event TO service_role;
