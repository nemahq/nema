-- =============================================================
-- Statement에 Digest 칸 위치(source_field/source_field_index) 기록
--
-- 관계 판정 화면이 "충돌하는 문장"을 카드에 하이라이트해야 하는데, Statement
-- 내용이 Digest 원문을 그대로 복사한 게 아니라 LLM이 재작성한 문장이라 텍스트
-- 매칭이 불안정하다. 추출 시점에 어느 칸(situation/choice/reason/tradeoff[n]
-- 등)에서 나왔는지 직접 기록해두면 매칭 없이 바로 하이라이트할 수 있다.
--
-- source_field 값은 FE DIGEST_BODY_FIELDS(apps/web/src/features/review/constants.ts)의
-- key 문자열과 정확히 일치한다 — 별도 매핑 없이 그대로 쓰기 위함. source_field_index는
-- tradeoff/alternatives/branches 같은 배열 칸일 때만 채워지는 0-based 위치.
--
-- 최신 apply_extraction_statements 정의는 20260707200000_digest_manual_edit.sql —
-- 그 사이 마이그레이션들은 이 함수를 CREATE OR REPLACE하지 않았다(주석에서만 언급).
-- 이 함수 본문 위에 두 컬럼 반영만 얹는다.
--
-- 기존 진술(이 마이그레이션 이전 추출분)은 두 컬럼 다 NULL로 남는다 — 백필하지
-- 않는다(추출 당시 원문 대조 없이는 소급 복원 불가, 별도 합의).
-- =============================================================

ALTER TABLE statements
  ADD COLUMN source_field text,
  ADD COLUMN source_field_index integer;

CREATE OR REPLACE FUNCTION apply_extraction_statements(
  p_source_id  uuid,
  p_digest_ids uuid[],
  p_statements jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_statement_id uuid;
  v_item         jsonb;
BEGIN
  IF jsonb_typeof(p_statements) != 'array' THEN
    RAISE EXCEPTION 'p_statements must be a JSON array';
  END IF;

  -- 완료 표시 = pending 클레임(source 단위). 이미 completed/failed면 멈춰 늦게 도착한
  -- 적용이 진술을 중복 생성하지 못하게 한다.
  UPDATE sources
  SET extraction_status = 'completed', error_message = NULL
  WHERE id = p_source_id AND extraction_status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending extraction', p_source_id;
  END IF;

  -- 처리한 digest를 완료 표시 — 진술 0개짜리도 여기서 닫아 재추출 루프를 막는다.
  UPDATE digests SET extraction_status = 'completed'
  WHERE id = ANY(p_digest_ids) AND extraction_status = 'pending';

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_statements)
  LOOP
    IF v_item->>'index' IS NULL THEN
      RAISE EXCEPTION 'each statement requires an index (source order)';
    END IF;
    IF v_item->>'digest_id' IS NULL THEN
      RAISE EXCEPTION 'each statement requires a digest_id (extraction origin)';
    END IF;

    -- 진술이 붙을 곳 = 그 digest를 만든 changeset. ingestion Digest면 ingestion
    -- changeset, manual 수정 Digest면 그 manual changeset — 되돌리기·purge가 진술을
    -- 자기 인제스천/수정과 함께 되돌리게 한다(07-modeling: 2단계는 같은 changeset의 연속).
    SELECT ch.changeset_id INTO v_changeset_id
    FROM changes ch
    WHERE ch.target_type = 'digest' AND ch.action = 'create'
      AND ch.target_id = (v_item->>'digest_id')::uuid
    LIMIT 1;

    IF v_changeset_id IS NULL THEN
      RAISE EXCEPTION 'no creating changeset for digest %', v_item->>'digest_id';
    END IF;

    INSERT INTO statements (space_id, content, type, confidence, due_date, digest_id, source_field, source_field_index)
    VALUES (
      v_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence,
      (v_item->>'due_date')::date,
      (v_item->>'digest_id')::uuid,
      v_item->>'source_field',
      (v_item->>'source_field_index')::int
    )
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_sources (statement_id, source_id, locator)
    VALUES (
      v_statement_id,
      p_source_id,
      jsonb_build_object('index', (v_item->>'index')::int)
    );

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'statement', v_statement_id, v_item - 'index');
  END LOOP;

  -- 임베딩 안전망 (적용 직후 워커가 죽어도 재기동 후 pending 진술을 깨운다)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION apply_extraction_statements(uuid, uuid[], jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_extraction_statements(uuid, uuid[], jsonb) TO service_role;
