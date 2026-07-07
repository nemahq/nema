-- =============================================================
-- 같음(중복)을 정식 Relation으로 (07-modeling.md Relation·Changeset)
--
-- 중복 판정이 statements.duplicate_of + 즉시 archive에 그치지 않고, 실제
-- statement_relations 행(type='duplicates', from=keeper, to=duplicate)을 만들도록
-- 전환한다. 방향 규약: 남는 쪽(keeper)=from(A), 지워지는 쪽(duplicate)=to(B).
--
-- 네 조각:
--  1) cascade 트리거가 duplicates 관계는 건드리지 않게 — 이 관계의 상태는 끝점
--     연쇄가 아니라 그 changeset(승인/되돌리기)이 몬다. duplicates 관계는 태생이
--     "to(B)가 archived인" 모양이라, 일반 규칙("끝점 archived면 관계도 archive")을
--     그대로 적용하면 방금 만든 근거 행이 사라진다.
--  2) apply_relation_changesets에서 p_duplicates 파라미터·블록 제거 — 중복은 더
--     이상 즉시 적용되지 않고 pending 관계 제안(p_pending)으로 흘러 사람 검토를
--     거친다(07-modeling.md: "모순·중복은 확신도와 무관하게 항상 사람 확인").
--  3) apply_pending_relation: 승인되는 관계가 duplicates면 to(B)를 archive하고
--     그 archive를 changes에 남긴다 — 되돌리기가 병합을 풀 수 있게. 관계 행은
--     1) 덕에 active로 남아 "B가 A에게 합쳐졌다"의 근거가 된다.
--  4) statements.duplicate_of 컬럼·인덱스 제거 — 병합 근거는 이제 관계 행 하나가
--     유일 출처(source-service의 folded-sources도 관계로 조회).
--
-- 기존 즉시-병합 데이터(duplicate_of만 있고 관계 행 없음)는 backfill하지 않는다 —
-- 전부 테스트용이고(changeset_model_v2에서 합의), 관계 전환 이후분만 근거를 갖는다.
-- =============================================================

-- =============================================================
-- 1) cascade 트리거 — duplicates 관계는 끝점 연쇄에서 제외
-- =============================================================

CREATE OR REPLACE FUNCTION cascade_archive_statement_relations()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'archived' THEN
    -- 끝점이 가려지면 그 끝점에 걸린 active 관계를 함께 가린다. 단 duplicates는
    -- 제외 — 이 관계는 "to가 archived"가 정상 상태라 여기서 가리면 근거가 사라진다.
    -- 불변식: keeper(from)는 폐기되지 않는다(가리는 건 새 진술=to뿐). 이 전제가 깨져
    -- keeper를 archive하는 경로가 생기면 그 duplicates 관계가 active로 stranded된다
    -- (archived keeper는 화면에 안 떠 실피해는 없으나, 그 경로 신설 시 여기 재검토).
    UPDATE statement_relations
    SET status = 'archived'
    WHERE status = 'active' AND type <> 'duplicates'
      AND (from_id = NEW.id OR to_id = NEW.id);
  ELSE
    -- 끝점이 되살아나면, 양끝이 다 active인 관계만 복귀시킨다. duplicates는 제외 —
    -- 되돌리기가 관계 행을 명시적으로 archive하므로 끝점 복귀로 되살리면 안 된다.
    UPDATE statement_relations r
    SET status = 'active'
    WHERE r.status = 'archived' AND r.type <> 'duplicates'
      AND (r.from_id = NEW.id OR r.to_id = NEW.id)
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.from_id AND s.status = 'active')
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.to_id   AND s.status = 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) apply_relation_changesets — p_duplicates 제거
--    중복은 이제 p_pending으로 흘러 사람 검토를 거친다. applied/pending 블록은
--    20260706113904와 동일, 중복 즉시-병합 블록만 걷어낸다.
-- =============================================================

DROP FUNCTION IF EXISTS apply_relation_changesets(uuid, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id  uuid,
  p_applied    jsonb DEFAULT '[]'::jsonb,
  p_pending    jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_relation_id  uuid;
  v_item         jsonb;
  v_applied_any  boolean := false;
BEGIN
  IF jsonb_typeof(p_applied) != 'array'
     OR jsonb_typeof(p_pending) != 'array' THEN
    RAISE EXCEPTION 'p_applied, p_pending must be JSON arrays';
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
  -- 애매·모순(conflicts)·같음(duplicates) 모두 여기로 흘러 사람 검토를 거친다.
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

REVOKE ALL ON FUNCTION apply_relation_changesets FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_relation_changesets TO service_role;

-- =============================================================
-- 3) apply_pending_relation — 승인 관계가 duplicates면 to(B) 폐기
--    관계 행 생성/복원(기존 로직) 뒤, duplicates에 한해 to를 archive하고 그 archive를
--    changes에 남긴다(되돌리기가 병합을 풀 수 있게). cascade 트리거는 1)로 duplicates
--    관계를 안 건드리므로 관계 행은 active로 남아 근거가 된다. ingestion_status='pending'
--    이 벡터 축출을 부른다(sweep이 fetch_pending_statements로 집어 삭제).
-- =============================================================

CREATE OR REPLACE FUNCTION apply_pending_relation(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_change_id    uuid;
  v_reserved_id  uuid;
  v_rel_type     relation_type;
  v_from_id      uuid;
  v_to_id        uuid;
  v_relation_id  uuid;
  v_existing     record;
BEGIN
  SELECT space_id, status, type INTO v_space_id, v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'relation' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending relation proposal', p_changeset_id;
  END IF;

  -- pending 제안은 change 하나(예약 target_id + data{type,from,to})
  SELECT id, target_id, data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_change_id, v_reserved_id, v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending relation changeset % has no relation change', p_changeset_id;
  END IF;

  -- 끝점 무결성: 대기 중 끝점이 archived됐으면 active 관계를 걸 수 없다(§5.1 E).
  -- duplicates도 여기서 걸린다 — to(가릴 쪽)가 이미 다른 경로로 archived면 병합 불가.
  IF NOT EXISTS (SELECT 1 FROM statements WHERE id = v_from_id AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM statements WHERE id = v_to_id AND status = 'active') THEN
    RAISE EXCEPTION 'endpoint no longer active for relation proposal %', p_changeset_id;
  END IF;

  -- (from,to,type)는 상태 무관 유니크 — 기존 행을 먼저 본다.
  SELECT id, status INTO v_existing
  FROM statement_relations
  WHERE from_id = v_from_id AND to_id = v_to_id AND type = v_rel_type;

  IF NOT FOUND THEN
    -- 없음 → 예약 id로 새로 생성. change는 그대로 {create, 예약 id}.
    INSERT INTO statement_relations (id, space_id, type, from_id, to_id)
    VALUES (v_reserved_id, v_space_id, v_rel_type, v_from_id, v_to_id);
    v_relation_id := v_reserved_id;
  ELSIF v_existing.status = 'archived' THEN
    -- 가려져 있던 같은 관계 → 되살림. change를 {restore, 기존 id}로 갱신.
    UPDATE statement_relations SET status = 'active' WHERE id = v_existing.id;
    v_relation_id := v_existing.id;
    UPDATE changes SET action = 'restore', target_id = v_relation_id, data = NULL
    WHERE id = v_change_id;
  ELSE
    -- 이미 active(드문 중복 제안) → 전이 없음. change를 지워 revert가 손대지 않게
    -- 한다(§4.4 "실제 전이만 기록"). 변경셋 헤더는 "적용 결정"의 흔적으로 남는다.
    v_relation_id := v_existing.id;
    DELETE FROM changes WHERE id = v_change_id;
  END IF;

  -- 같음(duplicates) 승인 = 가릴 쪽(to/B) 폐기. keeper(from/A)만 남고 B는 archived +
  -- 벡터 축출(ingestion_status='pending'). archive를 changes에 남겨 되돌리기가 병합을
  -- 푼다. status='active' 가드로 재시도 멱등. cascade 트리거(1)가 duplicates 관계는
  -- 안 건드리므로 방금 만든 관계 행은 active로 남는다.
  IF v_rel_type = 'duplicates' THEN
    UPDATE statements
    SET status = 'archived', ingestion_status = 'pending'
    WHERE id = v_to_id AND status = 'active';
    -- 끝점 검사와 이 UPDATE 사이(READ COMMITTED) B가 동시 archive되는 좁은 경쟁이면
    -- 관계만 생기고 archive change가 안 남아 되돌리기가 반쪽이 된다. 조용한 반쪽 병합
    -- 대신 트랜잭션째 abort — changeset은 pending으로 남아 사람이 재시도한다.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'duplicate endpoint % no longer active at merge time', v_to_id;
    END IF;
    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (p_changeset_id, 'archive', 'statement', v_to_id);
  END IF;

  UPDATE changesets SET status = 'applied' WHERE id = p_changeset_id;

  RETURN v_relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION apply_pending_relation FROM public, anon;
GRANT EXECUTE ON FUNCTION apply_pending_relation TO authenticated, service_role;

-- =============================================================
-- 4) statements.duplicate_of 제거 — 병합 근거는 이제 관계 행이 유일 출처
-- =============================================================

DROP INDEX IF EXISTS idx_statements_duplicate_of_archived;
ALTER TABLE statements DROP COLUMN IF EXISTS duplicate_of;
