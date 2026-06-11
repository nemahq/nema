-- =============================================================
-- 넣기 파이프 RPC — ingestion-design 확정분 반영
--
-- 박제는 동기(create_source), 추출 적용은 비동기(apply_ingestion_changeset)의
-- 2단계로 확정됨에 따라:
--   1) create_source 신규 — source 박제 + 큐 notify, 응답은 source_id
--   2) apply_ingestion_changeset 재작성 — 미리 박제된 pending source에 진술을
--      붙이는 비동기 적용 계약으로 교체 (기존 동기형 임시 계약 폐기)
--   3) retry_source_extraction / retry_statement_ingestion 신규 —
--      failed는 자동 재시도가 멈춘 상태일 뿐, 수동 재개 경로를 둔다
-- =============================================================

-- =============================================================
-- 1) create_source — 박제까지만 동기, 추출·임베딩은 워커
-- =============================================================

-- 직접 쓰기는 RLS로 막혀 있으므로(SELECT-only) 박제도 RPC 경유.
CREATE OR REPLACE FUNCTION create_source(
  p_space_id   uuid,
  p_body       text,
  p_session_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_source_id uuid;
BEGIN
  -- SECURITY DEFINER라 RLS를 안 타므로 소유 검증은 RPC 몫
  IF NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', p_space_id;
  END IF;

  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'p_body must be a non-empty text';
  END IF;

  INSERT INTO sources (space_id, author_id, session_id, body)
  VALUES (p_space_id, auth.uid(), p_session_id, p_body)
  RETURNING id INTO v_source_id;

  -- 추출 워커 깨우기 (extraction_status가 pending으로 생성됨)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 2) apply_ingestion_changeset 재작성 — pending source에 추출 결과를
--    한 트랜잭션으로 적용 (시그니처 변경이라 DROP 선행)
-- =============================================================

DROP FUNCTION apply_ingestion_changeset(uuid, uuid, uuid, text, jsonb);

-- p_statements: [{ "content": text, "type": statement_type,
--                  "confidence": statement_confidence|null, "index": int }]
--   index = 원문 등장 순서. statement_sources.locator에 {"index": n}으로 기록 —
--   한 트랜잭션에서 생긴 진술들은 created_at이 같아 원문 순서는 이 값에만 기댄다.
-- 진술이 0개면(노이즈뿐인 글) 이 RPC 대신 complete_source_extraction을 호출한다 —
--   빈 changeset을 남기지 않는다.
-- source 완료 표시가 같은 트랜잭션이어야 하는 이유: 갈라지면 적용 성공 후 크래시 시
--   워커가 같은 source를 재추출해 진술이 중복 생성된다.
CREATE OR REPLACE FUNCTION apply_ingestion_changeset(
  p_source_id  uuid,
  p_statements jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_author_id    uuid;
  v_changeset_id uuid;
  v_statement_id uuid;
  v_item         jsonb;
BEGIN
  IF jsonb_typeof(p_statements) != 'array' OR jsonb_array_length(p_statements) = 0 THEN
    RAISE EXCEPTION 'p_statements must be a non-empty JSON array';
  END IF;

  -- 완료 표시 = pending 클레임. 이미 completed/failed면 여기서 멈춰
  -- 늦게 도착한 적용이 진술을 중복 생성하지 못하게 한다.
  UPDATE sources
  SET extraction_status = 'completed',
      error_message     = NULL
  WHERE id = p_source_id AND extraction_status = 'pending'
  RETURNING space_id, author_id INTO v_space_id, v_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending extraction', p_source_id;
  END IF;

  -- author_id는 source 제출자에서 파생. 박제 후 계정이 삭제됐으면 NULL —
  -- 계정 삭제 시 "익명으로 기록 보존"(schema 4.5)과 같은 축이라 막지 않는다.
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'ingestion', 'applied', p_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_statements)
  LOOP
    IF v_item->>'index' IS NULL THEN
      RAISE EXCEPTION 'each statement requires an index (source order)';
    END IF;

    INSERT INTO statements (space_id, content, type, confidence)
    VALUES (
      v_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence
    )
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_sources (statement_id, source_id, locator)
    VALUES (
      v_statement_id,
      p_source_id,
      jsonb_build_object('index', (v_item->>'index')::int)
    );

    -- source의 생성 이력은 changesets.source_id가 담당 — changes엔 진술 create만.
    -- 원문 순서는 locator 몫이라 data에선 index를 뺀다.
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'statement', v_statement_id, v_item - 'index');
  END LOOP;

  -- 임베딩 안전망: 평소엔 같은 사이클의 임베딩 단계가 pending 진술을 집어가지만,
  -- 적용 직후 워커가 죽으면 이 notify가 재기동 후 임베딩을 깨운다.
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 3) 수동 재개 RPC — failed를 pending으로 되돌리고 워커를 깨운다.
--    첫 출시에선 운영자 도구. 사용자용 "다시 시도" 버튼도 같은 RPC를 쓴다.
-- =============================================================

CREATE OR REPLACE FUNCTION retry_source_extraction(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- service_role은 auth.uid()가 NULL(운영자 경로), 사용자는 멤버십 검증
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = p_source_id AND is_space_member(s.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access source %', p_source_id;
  END IF;

  -- last_extraction_attempt도 비워 lease 대기 없이 즉시 재인출되게 한다
  UPDATE sources
  SET extraction_status        = 'pending',
      extraction_retry_count   = 0,
      last_extraction_attempt  = NULL,
      error_message            = NULL
  WHERE id = p_source_id AND extraction_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not failed', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION retry_statement_ingestion(p_statement_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM statements st
    WHERE st.id = p_statement_id AND is_space_member(st.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access statement %', p_statement_id;
  END IF;

  UPDATE statements
  SET ingestion_status        = 'pending',
      ingestion_retry_count   = 0,
      last_ingestion_attempt  = NULL,
      error_message           = NULL
  WHERE id = p_statement_id AND ingestion_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement % is not failed', p_statement_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions
-- =============================================================

-- 박제는 사용자 경로 (RPC 안에서 is_space_member 검증)
REVOKE ALL ON FUNCTION create_source FROM public, anon;
GRANT EXECUTE ON FUNCTION create_source TO authenticated, service_role;

-- 적용은 워커 전용
REVOKE ALL ON FUNCTION apply_ingestion_changeset FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ingestion_changeset TO service_role;

-- 수동 재개: 운영자(service_role) + 사용자(멤버십 검증)
REVOKE ALL ON FUNCTION retry_source_extraction FROM public, anon;
GRANT EXECUTE ON FUNCTION retry_source_extraction TO authenticated, service_role;

REVOKE ALL ON FUNCTION retry_statement_ingestion FROM public, anon;
GRANT EXECUTE ON FUNCTION retry_statement_ingestion TO authenticated, service_role;
