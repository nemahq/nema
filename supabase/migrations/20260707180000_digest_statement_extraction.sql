-- =============================================================
-- Digest 파이프라인 2단계 — 확정된 Digest.body에서 Statement 추출
--
-- 07-modeling 확정 동작: 리뷰 확정(1단계)이 원문을 active로 밀면, 추출(2단계)이
-- 그 원문의 확정된 Digest들을 읽어 Statement를 뽑는다. Statement는 Source가 아니라
-- 자기가 나온 Digest를 digest_id로 가리키고(확정 후 안 바뀌는 Digest라 근거가 안정적),
-- 그 create는 confirm이 만든 **같은 ingestion changeset에 이어 붙는다**(2단계는 같은
-- 인제스천의 연속 — 원문 빼기 되돌리기가 Digest·Reference·진술을 하나로 닫으려면
-- 셋이 한 changeset에 있어야 한다).
--
-- 1) apply_ingestion_changeset → apply_extraction_statements 재작성:
--    새 changeset을 만들지 않고, 그 원문의 applied ingestion changeset에
--    create statement change를 append + statements.digest_id 채움.
-- 2) service_role에 digests SELECT — 워커가 원문의 확정 Digest를 인출한다.
-- =============================================================

-- =============================================================
-- 1) apply_extraction_statements — 진술을 원문의 ingestion changeset에 덧붙인다
--
-- p_statements 원소:
--   { "content", "type", "confidence"|null, "digest_id", "index", "due_date"|null }
--   - digest_id: 이 진술이 나온 Digest (추출 근거, statements.digest_id로 저장)
--   - index: 원문 등장 순서(원문 전체 관통). locator로 저장 — 잇기 정렬이 쓴다.
-- =============================================================

-- 이름·계약이 바뀌므로(더 이상 changeset을 만들지 않는다) 옛 함수를 지운다.
DROP FUNCTION IF EXISTS apply_ingestion_changeset(uuid, jsonb);

CREATE FUNCTION apply_extraction_statements(
  p_source_id  uuid,
  p_statements jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_statement_id uuid;
  v_item         jsonb;
BEGIN
  IF jsonb_typeof(p_statements) != 'array' OR jsonb_array_length(p_statements) = 0 THEN
    RAISE EXCEPTION 'p_statements must be a non-empty JSON array';
  END IF;

  -- 완료 표시 = pending 클레임. 이미 completed/failed면 여기서 멈춰 늦게 도착한
  -- 적용이 진술을 중복 생성(같은 changeset에 이중 append)하지 못하게 한다.
  UPDATE sources
  SET extraction_status = 'completed',
      error_message     = NULL
  WHERE id = p_source_id AND extraction_status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending extraction', p_source_id;
  END IF;

  -- 진술을 붙일 곳 = confirm이 만든 그 원문의 applied ingestion changeset.
  -- J는 원문 1개 = ingestion changeset 1개. O(Digest 수정)에서 원문에 changeset이
  -- 여럿(ingestion + manual)이 되면 여기를 "진술의 digest를 만든 changeset"으로
  -- 일반화한다 — 지금은 그 확장을 막지 않도록 원문 단위로만 좁힌다.
  SELECT id INTO v_changeset_id
  FROM changesets
  WHERE source_id = p_source_id AND type = 'ingestion' AND status = 'applied'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_changeset_id IS NULL THEN
    RAISE EXCEPTION 'no applied ingestion changeset for source %', p_source_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_statements)
  LOOP
    IF v_item->>'index' IS NULL THEN
      RAISE EXCEPTION 'each statement requires an index (source order)';
    END IF;
    IF v_item->>'digest_id' IS NULL THEN
      RAISE EXCEPTION 'each statement requires a digest_id (extraction origin)';
    END IF;

    -- due_date는 워커가 정규화한 절대 날짜(없으면 NULL). digest_id FK가 Digest 실재를
    -- 보증한다 — 워커가 원문의 digest만 넘기므로 소속 검증은 워커 몫.
    INSERT INTO statements (space_id, content, type, confidence, due_date, digest_id)
    VALUES (
      v_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence,
      (v_item->>'due_date')::date,
      (v_item->>'digest_id')::uuid
    )
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_sources (statement_id, source_id, locator)
    VALUES (
      v_statement_id,
      p_source_id,
      jsonb_build_object('index', (v_item->>'index')::int)
    );

    -- create data는 자기완결(07-modeling): 만들어진 시점 필드 그대로. 원문 순서는
    -- locator 몫이라 index를 뺀다. digest_id·due_date는 진술의 근거·기한이라 남긴다.
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'statement', v_statement_id, v_item - 'index');
  END LOOP;

  -- 임베딩 안전망: 평소엔 같은 사이클의 임베딩 단계가 pending 진술을 집어가지만,
  -- 적용 직후 워커가 죽으면 이 notify가 재기동 후 임베딩을 깨운다.
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION apply_extraction_statements(uuid, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_extraction_statements(uuid, jsonb) TO service_role;

-- =============================================================
-- 2) digests SELECT — 워커가 원문의 확정 Digest(body)를 추출 입력으로 인출한다.
--    grant_statement_engine_table_access와 같은 이유(환경별 default privilege 편차를
--    타지 않게 명시). authenticated는 여기서 다루지 않는다 — 프론트 조회는 별개 경로.
-- =============================================================

GRANT SELECT ON public.digests TO service_role;
