-- =============================================================
-- apply_relation_changesets 재적용 — staging 드리프트 수정
--
-- 20260727101911_relation_guard_and_title_fix.sql(PR #512)이 마이그레이션
-- 이력 테이블엔 "적용됨"으로 기록돼 있었지만, staging DB에 실제로 떠 있던
-- 함수 본문은 그 이전 정의(digests.title join, 방향 있는 재제안 가드)였다
-- (supabase db dump로 직접 대조해 확인). 정확한 재현 경로는 확정 못 했지만
-- (여러 워크트리에서 동시에 /migrate가 돌며 생긴 레이스로 추정), 내용
-- 자체는 이미 리뷰·머지된 #512와 동일 — 새 검토 없이 그대로 다시 얹는다.
--
-- 이 마이그레이션은 20260727101911과 정확히 같은 CREATE OR REPLACE FUNCTION +
-- 백필을 반복한다. 백필이 다시 도는 부수 효과로, 드리프트 기간에 옛 로직으로
-- 생성된 open relation changeset(예: #11)의 title도 이 참에 같이 정정된다.
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
  v_from_content text;
  v_to_content   text;
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

  -- ----- 자동 적용분: 관계 행 생성 후, 실제로 생긴 게 있을 때만 변경셋을 묶는다 -----
  INSERT INTO changesets (space_id, type, status, outcome, source_id)
  VALUES (v_space_id, 'relation', 'closed', 'applied', p_source_id)
  RETURNING id INTO v_changeset_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_applied)
  LOOP
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

  -- ----- 사람 판정분: 건당 변경셋 1개. title = 끝점 Statement 내용 "A vs B" -----
  -- 애매·모순(conflicts)·같음(duplicates) 모두 여기로 흘러 사람 검토를 거친다.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pending)
  LOOP
    -- 재시도가 같은 쌍을 다시 제안하면 아직 열려 있는 변경셋을 건너뛴다. 사람이
    -- 실제로 거절한(invalidated_by_id가 NULL인) discarded 쌍도 다시 안 올린다 —
    -- 캐스케이드로 무효화된(invalidated_by_id가 있는) discarded는 막지 않는다.
    -- conflicts·duplicates는 논리상 대칭이라(worker.ts changeKey와 동일하게)
    -- 양끝을 정렬해 비교해, 방향이 뒤집힌 재제안(B→A)도 같은 쌍으로 잡는다.
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM changesets c
      JOIN changes ch ON ch.changeset_id = c.id
      WHERE c.space_id = v_space_id
        AND (
          c.status = 'open'
          OR (c.status = 'closed' AND c.outcome = 'discarded' AND c.invalidated_by_id IS NULL)
        )
        AND ch.target_type = 'relation'
        AND ch.data->>'type' = v_item->>'type'
        AND (
          (ch.data->>'from_id' = v_item->>'from_id' AND ch.data->>'to_id' = v_item->>'to_id')
          OR (
            v_item->>'type' IN ('conflicts', 'duplicates')
            AND ch.data->>'from_id' = v_item->>'to_id'
            AND ch.data->>'to_id'   = v_item->>'from_id'
          )
        )
    );

    SELECT s.content INTO v_from_content
    FROM statements s
    WHERE s.id = (v_item->>'from_id')::uuid;

    SELECT s.content INTO v_to_content
    FROM statements s
    WHERE s.id = (v_item->>'to_id')::uuid;

    INSERT INTO changesets (space_id, type, status, source_id, title)
    VALUES (
      v_space_id, 'relation', 'open', p_source_id,
      CASE WHEN v_from_content IS NOT NULL AND v_to_content IS NOT NULL
        THEN v_from_content || ' vs ' || v_to_content
      END
    )
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

-- ----- 드리프트 기간에 옛 로직으로 생성된 open relation changeset title 재백필 -----
ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

UPDATE changesets c
SET title = pair.title
FROM (
  SELECT ch.changeset_id,
         sf.content || ' vs ' || st.content AS title
  FROM changes ch
  JOIN statements sf ON sf.id = (ch.data->>'from_id')::uuid
  JOIN statements st ON st.id = (ch.data->>'to_id')::uuid
  WHERE ch.target_type = 'relation' AND ch.action = 'create'
) pair
WHERE c.id = pair.changeset_id
  AND c.type = 'relation' AND c.status = 'open';

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;
