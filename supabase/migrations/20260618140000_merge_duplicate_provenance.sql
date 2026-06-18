-- =============================================================
-- 합쳐진 출처 링크 — statements.duplicate_of + apply가 남길 진술을 받아 세팅 (NEM-162 마지막 슬라이스)
--
-- 가린 중복이 "어느 진술로 합쳐졌나"를 남긴다. 읽기(NEM-133 UI)는 "duplicate_of=A이고
-- archived인 진술들의 출처"를 모아 "이 진술은 글 A·B에서 나옴(N번)"을 만든다 — 더 믿게 됨.
--
-- 되돌리기 정합이 공짜인 이유: duplicate_of는 archived인 진술에서만 의미를 본다. revert가
-- 중복을 active로 되살리면 집계에서 자동으로 빠지므로 duplicate_of를 지울 필요가 없다.
-- 그래서 changes 모델·revert 확장 없이 컬럼 하나 + 상태로 거르는 읽기로 끝난다.
--
-- apply_relation_changesets 시그니처를 p_duplicate_ids uuid[] → p_duplicates jsonb
-- ([{duplicate, keeper}])로 바꾼다(keeper가 필요해짐). 시그니처 변경이라 DROP 후 재생성 —
-- applied/pending 블록(특히 rejected 재제안 가드)은 그대로 보존한다.
-- =============================================================

ALTER TABLE statements
  ADD COLUMN duplicate_of uuid REFERENCES statements(id) ON DELETE SET NULL;

COMMENT ON COLUMN statements.duplicate_of IS
  '이 진술이 같은 말로 합쳐져 들어간 남길 진술(NEM-162). archived일 때만 의미 — 합쳐진 출처 집계에 쓰인다.';

DROP FUNCTION IF EXISTS apply_relation_changesets(uuid, jsonb, jsonb, uuid[]);

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id  uuid,
  p_applied    jsonb DEFAULT '[]'::jsonb,
  p_pending    jsonb DEFAULT '[]'::jsonb,
  p_duplicates jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id           uuid;
  v_changeset_id       uuid;
  v_relation_id        uuid;
  v_item               jsonb;
  v_applied_any        boolean := false;
  v_archived_id        uuid;
  v_merge_changeset_id uuid;
BEGIN
  IF jsonb_typeof(p_applied) != 'array'
     OR jsonb_typeof(p_pending) != 'array'
     OR jsonb_typeof(p_duplicates) != 'array' THEN
    RAISE EXCEPTION 'p_applied, p_pending, p_duplicates must be JSON arrays';
  END IF;

  -- 완료 표시 = pending 클레임. 이미 completed/failed면 멈춰 늦게 도착한 적용이
  -- 관계를 중복 생성하지 못하게 한다 (apply_ingestion_changeset과 같은 논리).
  UPDATE sources
  SET linking_status = 'completed',
      error_message  = NULL
  WHERE id = p_source_id AND linking_status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending linking', p_source_id;
  END IF;

  -- ----- applied: 관계 행 생성 후, 실제로 생긴 게 있을 때만 변경셋을 묶는다 -----
  -- 변경셋을 먼저 만들고 관계를 건다. 전부 중복(unique 충돌)이라 하나도 안 생기면
  -- 빈 변경셋이 남으므로, 그 경우 끝에서 지운다.
  INSERT INTO changesets (space_id, type, status, source_id)
  VALUES (v_space_id, 'relation', 'applied', p_source_id)
  RETURNING id INTO v_changeset_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_applied)
  LOOP
    -- 재시도가 같은 관계를 이중 적용하면 unique가 막는다 — 충돌 시 건너뛴다.
    INSERT INTO statement_relations (space_id, type, from_id, to_id)
    VALUES (
      v_space_id,
      (v_item->>'type')::relation_type,
      (v_item->>'from_id')::uuid,
      (v_item->>'to_id')::uuid
    )
    ON CONFLICT (from_id, to_id, type) DO NOTHING
    RETURNING id INTO v_relation_id;

    IF v_relation_id IS NOT NULL THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data)
      VALUES (
        v_changeset_id, 'create', 'relation', v_relation_id,
        jsonb_build_object(
          'type',    v_item->>'type',
          'from_id', v_item->>'from_id',
          'to_id',   v_item->>'to_id'
        )
      );
      v_applied_any := true;
    END IF;
  END LOOP;

  IF NOT v_applied_any THEN
    DELETE FROM changesets WHERE id = v_changeset_id;
  END IF;

  -- ----- pending: 건당 변경셋 1개. 관계 행은 안 만든다 -----
  -- target_id는 승인 시 생길 관계의 id를 미리 예약한다(changes.target_id NOT NULL).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pending)
  LOOP
    -- 재시도가 같은 쌍을 다시 제안하면 기존 pending 변경셋을 건너뛴다(§6 빌드 세부).
    -- 사람이 거절(rejected)한 쌍도 다시 올리지 않는다(intervention-design §6) —
    -- pending·rejected를 함께 본다. best-effort다 — 관계 행이 없어 unique로 못 막고,
    -- 같은 space의 형제 source가 병렬(LINKING_CONCURRENCY)일 때 check-then-insert
    -- 경쟁으로 중복 pending이 샐 수 있다. 해는 가볍다(검토함의 중복 항목 하나, 표시단
    -- dedup 가능) — 승인 시점엔 statement_relations의 (from,to,type) unique가
    -- 이중 적용을 막는다.
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM changesets c
      JOIN changes ch ON ch.changeset_id = c.id
      WHERE c.space_id = v_space_id
        AND c.type = 'relation' AND c.status IN ('pending', 'rejected')
        AND ch.target_type = 'relation'
        AND ch.data->>'from_id' = v_item->>'from_id'
        AND ch.data->>'to_id'   = v_item->>'to_id'
        AND ch.data->>'type'    = v_item->>'type'
    );

    INSERT INTO changesets (space_id, type, status, source_id)
    VALUES (v_space_id, 'relation', 'pending', p_source_id)
    RETURNING id INTO v_changeset_id;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      v_changeset_id, 'create', 'relation', gen_random_uuid(),
      jsonb_build_object(
        'type',    v_item->>'type',
        'from_id', v_item->>'from_id',
        'to_id',   v_item->>'to_id'
      )
    );
  END LOOP;

  -- ----- 같음(중복) 가리기: merge 변경셋 + archive + 남길 진술 링크 (NEM-162) -----
  -- p_duplicates: [{ "duplicate": uuid, "keeper": uuid }]. 가릴 진술은 워커가 이번 배치
  -- (새 진술)로 한정해 넘긴다. archive하며 duplicate_of=keeper를 박아 "어느 진술로 합쳐
  -- 졌나"를 남긴다 — 읽기는 archived인 자식만 보므로 되돌리기(restore)가 자동으로 출처에서
  -- 뺀다(duplicate_of를 지울 필요 없음). status='active' 가드로 재시도 멱등. 트리거가 관계
  -- 를 cascade로 가리고, ingestion_status='pending'이 벡터 삭제를 부른다. 실제 가린 게
  -- 있을 때만 변경셋(빈 merge 방지). source_id는 merge CHECK상 NULL.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_duplicates)
  LOOP
    UPDATE statements
    SET status = 'archived',
        ingestion_status = 'pending',
        duplicate_of = (v_item->>'keeper')::uuid
    WHERE id = (v_item->>'duplicate')::uuid
      AND space_id = v_space_id
      AND status = 'active'
    RETURNING id INTO v_archived_id;

    IF v_archived_id IS NOT NULL THEN
      IF v_merge_changeset_id IS NULL THEN
        INSERT INTO changesets (space_id, type, status)
        VALUES (v_space_id, 'merge', 'applied')
        RETURNING id INTO v_merge_changeset_id;
      END IF;
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_merge_changeset_id, 'archive', 'statement', v_archived_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION apply_relation_changesets FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_relation_changesets TO service_role;
