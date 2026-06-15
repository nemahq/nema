-- =============================================================
-- 사람 개입 4/4: 재제안 가드에 rejected 추가 (§6)
--
-- 워커의 apply_relation_changesets pending 중복 가드(20260614072231)는 같은
-- (from,to,type)의 pending 제안만 건너뛴다. 여기에 rejected도 포함해, 사람이
-- 거절한 쌍을 엔진이 다시 검토함에 올리지 않게 한다("한 번 아니라고 하면 계속 아니다").
--
-- CREATE OR REPLACE로 함수 전체를 다시 박되, 바뀌는 건 CONTINUE WHEN의 status
-- 조건 한 줄(pending → pending|rejected)뿐이다. 나머지는 원본과 동일.
-- 같은 쌍이라도 type이 다르면 막지 않는다(가드는 (from,to,type) 단위).
-- =============================================================

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id uuid,
  p_applied   jsonb DEFAULT '[]'::jsonb,
  p_pending   jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_relation_id  uuid;
  v_item         jsonb;
  v_applied_any  boolean := false;
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
