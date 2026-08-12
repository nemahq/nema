-- =============================================================
-- 용어 사전 v2 모델링: Changeset 모델 정합 (07-modeling.md)
--
-- 1) changeset_type에서 conflict·merge 제거 — 관계의 종류(conflicts/duplicates)는
--    Relation.type이 이미 구분하므로, changeset 레벨에서 또 나누면 같은 정보를
--    두 군데 적는 중복 축이 된다(문서 세션과 합의). conflict는 쓰는 코드가 없고,
--    merge는 apply_relation_changesets의 중복 가리기가 만들고 있어 같은
--    마이그레이션에서 type='relation' + source_id로 재지정한다(5) — dedup은 관계
--    엔진 판정의 산물이고 방아쇠가 그 원문의 저장이라 relation의 정의에 맞고,
--    source_id가 생기면서 완전 삭제 purge의 "source_id 그물"에도 걸리게 된다
--    (기존 merge는 source_id가 없어 purge가 놓치는 구멍이었다).
-- 2) change_target_type에 digest·reference 추가 — digests·references 테이블의
--    변경도 Changeset으로 다루기 위한 자리.
-- 3) modify는 reference 전용 — source·digest·statement·relation은 확정 후
--    불변(create/archive/restore만). Reference만 "다듬어지는 것"이 본질이라
--    modify를 쓴다.
-- 4) changesets.space_id nullable — Reference 직접 수정처럼 Workspace 스코프
--    콘텐츠가 대상이면 비운다. (그 경우의 조회 정책은 Reference 수정 흐름
--    구현 때 workspace 기반 정책으로 붙는다 — 현재 NULL 행을 만드는 경로 없음)
--
-- enum 값 제거·추가 모두 타입 재구성으로 처리 — ALTER TYPE ADD VALUE는 같은
-- 트랜잭션에서 그 값을 참조(3의 CHECK)할 수 없지만, 새로 만든 타입은 즉시
-- 참조 가능하다.
-- =============================================================

-- =============================================================
-- 1) changeset_type 재구성 — conflict·merge 제거
--
-- 기존 merge 행 폐기: merge 행은 source_id가 없어 relation 모양으로 재지정할
-- 수 없다(방아쇠 원문을 소급 특정 불가 — 중복 진술은 여러 원문을 가질 수 있음).
-- 현재 데이터는 전부 테스트용이라 폐기로 합의(Kyle). 폐기 후에도 남은 값의
-- 행이 있으면 USING 캐스팅이 실패하며 마이그레이션이 멈춘다 — 전제가 조용히
-- 넘어가지 않게 하는 의도된 동작.
-- =============================================================

DELETE FROM changesets WHERE type IN ('conflict', 'merge');

ALTER TABLE changesets DROP CONSTRAINT chk_changeset_shape;

ALTER TYPE changeset_type RENAME TO changeset_type_old;
CREATE TYPE changeset_type AS ENUM ('ingestion', 'relation', 'manual', 'revert');

ALTER TABLE changesets ALTER COLUMN type TYPE changeset_type
  USING (type::text::changeset_type);

DROP TYPE changeset_type_old;

-- conflict·merge 분기만 빠진 동일 제약 (20260614072230과 같은 내용)
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_shape CHECK (
  (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
  (type = 'relation'  AND source_id IS NOT NULL AND reverts_id IS NULL AND author_id IS NULL) OR
  (type = 'revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
  (type = 'manual'    AND source_id IS NULL AND reverts_id IS NULL)
);

-- =============================================================
-- 2) change_target_type 재구성 — digest·reference 추가
-- =============================================================

ALTER TABLE changes DROP CONSTRAINT chk_no_source_modify;

ALTER TYPE change_target_type RENAME TO change_target_type_old;
CREATE TYPE change_target_type AS ENUM ('statement', 'relation', 'source', 'digest', 'reference');

ALTER TABLE changes ALTER COLUMN target_type TYPE change_target_type
  USING (target_type::text::change_target_type);

DROP TYPE change_target_type_old;

-- =============================================================
-- 3) modify는 reference 전용 (chk_no_source_modify를 일반화해 대체)
-- =============================================================

ALTER TABLE changes ADD CONSTRAINT chk_modify_only_reference CHECK (
  NOT (action = 'modify' AND target_type <> 'reference')
);

-- =============================================================
-- 4) changesets.space_id nullable
-- =============================================================

ALTER TABLE changesets ALTER COLUMN space_id DROP NOT NULL;

-- =============================================================
-- 5) apply_relation_changesets — 중복 가리기 변경셋을 merge → relation으로 재지정
--    dedup 블록의 changeset INSERT만 다르고 나머지는 20260618140000과 동일.
--    같은 배치의 applied 관계 변경셋과 별도 행으로 둔다 — applied 쪽은 빈 변경셋
--    삭제 로직과 얽혀 있어 합치면 복잡도만 는다(purge는 둘 다 source_id로 잡는다).
-- =============================================================

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

  -- ----- 같음(중복) 가리기: relation 변경셋 + archive + 남길 진술 링크 (NEM-162) -----
  -- p_duplicates: [{ "duplicate": uuid, "keeper": uuid }]. 가릴 진술은 워커가 이번 배치
  -- (새 진술)로 한정해 넘긴다. archive하며 duplicate_of=keeper를 박아 "어느 진술로 합쳐
  -- 졌나"를 남긴다 — 읽기는 archived인 자식만 보므로 되돌리기(restore)가 자동으로 출처에서
  -- 뺀다(duplicate_of를 지울 필요 없음). status='active' 가드로 재시도 멱등. 트리거가 관계
  -- 를 cascade로 가리고, ingestion_status='pending'이 벡터 삭제를 부른다. 실제 가린 게
  -- 있을 때만 변경셋(빈 변경셋 방지). type='relation' + source_id — 중복 판정도 관계
  -- 엔진 산물이고, source_id 덕에 완전 삭제 purge의 source_id 그물에 걸린다.
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
        INSERT INTO changesets (space_id, type, status, source_id)
        VALUES (v_space_id, 'relation', 'applied', p_source_id)
        RETURNING id INTO v_merge_changeset_id;
      END IF;
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_merge_changeset_id, 'archive', 'statement', v_archived_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
