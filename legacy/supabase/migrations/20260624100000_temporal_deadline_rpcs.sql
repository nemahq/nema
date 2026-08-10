-- =============================================================
-- 시간 질의 재배치 (temporal-query-design 4·7장): 기한 저장 배관
--
-- create_source            — 작성자 존(author_timezone)을 받아 박는다. 추출이 글 속
--                            "금요일"을 이 존 기준으로 풀어 due_date를 채운다.
-- fetch_pending_sources    — 워커가 정규화에 쓰도록 author_timezone을 함께 반환.
-- apply_ingestion_changeset — 진술의 due_date(워커가 정규화한 절대 날짜)를 함께 INSERT.
--
-- create_source·fetch_pending_sources는 시그니처(인자/반환)가 바뀌어 DROP+CREATE한다.
-- =============================================================

-- ----- create_source: 작성자 존 저장 -----
DROP FUNCTION IF EXISTS create_source(uuid, text, uuid);
CREATE FUNCTION create_source(
  p_space_id        uuid,
  p_body            text,
  p_session_id      uuid DEFAULT NULL,
  p_author_timezone text DEFAULT NULL
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

  INSERT INTO sources (space_id, author_id, session_id, body, author_timezone)
  VALUES (p_space_id, auth.uid(), p_session_id, p_body, p_author_timezone)
  RETURNING id INTO v_source_id;

  -- 추출 워커 깨우기 (extraction_status가 pending으로 생성됨)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;
REVOKE ALL ON FUNCTION create_source(uuid, text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_source(uuid, text, uuid, text) TO authenticated, service_role;

-- ----- fetch_pending_sources: author_timezone 반환 추가 -----
DROP FUNCTION IF EXISTS fetch_pending_sources(int);
CREATE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  space_id        uuid,
  author_id       uuid,
  session_id      uuid,
  body            text,
  created_at      timestamptz,
  author_timezone text
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_extraction_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    WHERE s2.extraction_status = 'pending'
      AND s2.extraction_retry_count < p_max_retries
      AND (s2.last_extraction_attempt IS NULL
           OR s2.last_extraction_attempt + (s2.extraction_retry_count + 1) * interval '30 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at, s.author_timezone;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION fetch_pending_sources(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_sources(int) TO service_role;

-- ----- apply_ingestion_changeset: due_date 저장 추가 -----
-- p_statements: [{ "content", "type", "confidence"|null, "index", "due_date"|null }]
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

    -- due_date는 워커가 정규화한 절대 날짜(없으면 NULL) — 기한 없는 진술이 대부분.
    INSERT INTO statements (space_id, content, type, confidence, due_date)
    VALUES (
      v_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence,
      (v_item->>'due_date')::date
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
