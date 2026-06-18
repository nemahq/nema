-- =============================================================
-- 같음(중복) 가리기 — apply_relation_changesets에 p_duplicate_ids 추가 (NEM-162 동작 슬라이스)
--
-- 판정이 "같은 말"로 본 새 진술을 merge 변경셋으로 가린다(archive). 관계 적용과 같은
-- 트랜잭션·같은 source 완료에 묶여 원자적이다. 가리기는:
--   · cascade 트리거가 그 진술에 걸린 관계까지 함께 가리고
--   · ingestion_status='pending'이 워커의 벡터 삭제(임베딩 패스 archived 분기)를 부른다.
-- 되돌리기는 기존 revert_changeset의 archive→restore가 그대로 복구한다 — merge 전용
-- 되돌리기 코드가 필요 없다. 출처 접기·신호는 다음 슬라이스(되돌리기 모델 확장 필요).
--
-- 시그니처에 인자를 더하므로 DROP 후 재생성(CREATE OR REPLACE는 시그니처 변경 불가).
-- DROP이 GRANT를 함께 지우므로 끝에서 재부여한다.
-- =============================================================

DROP FUNCTION IF EXISTS apply_relation_changesets(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id     uuid,
  p_applied       jsonb  DEFAULT '[]'::jsonb,
  p_pending       jsonb  DEFAULT '[]'::jsonb,
  p_duplicate_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void AS $$
DECLARE
  v_space_id           uuid;
  v_changeset_id       uuid;
  v_relation_id        uuid;
  v_item               jsonb;
  v_applied_any        boolean := false;
  v_dup_id             uuid;
  v_archived_id        uuid;
  v_merge_changeset_id uuid;
BEGIN
  IF jsonb_typeof(p_applied) != 'array' OR jsonb_typeof(p_pending) != 'array' THEN
    RAISE EXCEPTION 'p_applied and p_pending must be JSON arrays';
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

  -- ----- 같음(중복) 가리기: merge 변경셋 1개 + 각 중복 진술 archive (NEM-162) -----
  -- 가릴 진술은 워커가 이번 배치(새 진술)로 한정해 넘긴다 — 새 글의 재진술 사본만
  -- 가리고 기존 진술은 안 건드린다. status='active' 가드로 재시도 멱등. 트리거가 그
  -- 진술의 관계를 cascade로 가리고, ingestion_status='pending'이 벡터 삭제를 부른다.
  -- 실제 가린 게 있을 때만 변경셋을 만든다(빈 merge 변경셋 방지). source_id는 merge
  -- CHECK상 NULL — 어느 글이 합쳤는지는 출처 접기를 더하는 다음 슬라이스가 남긴다.
  FOREACH v_dup_id IN ARRAY p_duplicate_ids
  LOOP
    UPDATE statements
    SET status = 'archived', ingestion_status = 'pending'
    WHERE id = v_dup_id AND space_id = v_space_id AND status = 'active'
    RETURNING id INTO v_archived_id;

    IF v_archived_id IS NOT NULL THEN
      IF v_merge_changeset_id IS NULL THEN
        INSERT INTO changesets (space_id, type, status)
        VALUES (v_space_id, 'merge', 'applied')
        RETURNING id INTO v_merge_changeset_id;
      END IF;
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_merge_changeset_id, 'archive', 'statement', v_dup_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION apply_relation_changesets FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_relation_changesets TO service_role;
