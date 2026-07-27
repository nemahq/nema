-- =============================================================
-- apply_relation_changesets 정합성 수정 — 재제안 가드 방향성·title 소스
--
-- 이 마이그레이션이 고치는 것:
--   1) 재제안 가드가 from_id/to_id를 그대로만 대조해, 사람이 실제로 거절한
--      (discarded, invalidated_by_id IS NULL) A-B 쌍을 엔진이 반대 방향
--      (B-A)으로 다시 제안하면 그냥 통과시켰다. worker.ts의 changeKey가 이미
--      conflicts·duplicates를 양끝 정렬로 collapse해 방향 무관 하나의 키로
--      다루는 것과 같은 이유로(단, 두 타입의 사정은 다르다 — 아래 가드
--      조건 옆 주석 참고), 이 가드도 두 타입에 한해서만 방향 무관 비교를
--      추가한다(다른 타입은 원래대로 방향 있게 비교 — supports 등은 방향에
--      의미가 있다). idx_changes_relation_from_id/to_id(20260721100000)를
--      계속 타도록 OR 두 갈래로 쓴다 — LEAST/GREATEST로 감싸면 이 표현식
--      인덱스가 안 먹혀 Space의 relation changeset 전체를 스캔하게 된다.
--   2) open 제안 changeset의 title이 끝점 Statement가 속한 digests.title을
--      "A vs B"로 합쳐 채웠다. conflicts는 review-flow.md 530~537행 스펙상
--      title이 Digest 제목이 아니라 실제로 부딪히는 Statement 내용 요약이어야
--      한다(Digest 제목은 더 넓은 주제를 담아 정작 뭐가 부딪히는지 안 보일 수
--      있음). digests join을 걷어내고 statements.content를 직접 쓴다.
--      duplicates도 같은 코드 경로를 타 "A vs B"로 채워지는데, 이건 정확한
--      스펙 반영이 아니라 review-flow.md 542~544행이 명시한 임시(stopgap)
--      상태다(원래는 병합 제안 Digest 자신의 제목을 써야 하지만, 그 기능이
--      아직 백엔드에 없다). 병합 제안 Digest가 생기면 이 부분은 별도로
--      다시 손봐야 한다.
--   3) 이미 만들어진 open relation changeset의 title도 위 2)와 같은 기준으로
--      백필한다(20260718090000의 title 백필 선례와 동일 패턴). closed는
--      그 시점 판단을 굳힌 기록이라 건드리지 않는다.
--
-- 위 세 지점 외 로직·포맷은 기존 정의(20260726075454)와 동일하다.
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
    -- conflicts는 관계 자체가 대칭이라 방향이 의미 없다. duplicates는 저장은
    -- keeper(from)→duplicate(to)로 방향이 있지만(07-modeling.md 123행), "이 두
    -- 진술이 같은가"라는 사람의 판정 자체는 어느 쪽이 keeper로 제안됐든 같은
    -- 질문이라 방향 무관하게 한 쌍으로 묶는다(worker.ts changeKey와 같은 이유).
    -- 그래서 두 타입만 두 번째 OR 갈래로 방향이 뒤집힌 매치도 잡는다 — 반대로
    -- 방향 자체에 의미가 있는 타입(supports 등)은 첫 갈래(정방향 일치)만 걸려야
    -- 한다. LEAST/GREATEST로 감싸지 않고 OR로 푼 건 idx_changes_relation_from_id/
    -- to_id(20260721100000) 표현식 인덱스를 그대로 태우기 위해서다.
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

-- ----- 기존 open relation changeset title 백필 -----
-- 이 함수 재정의는 새로 생기는 changeset부터만 적용된다. 이미 만들어진 open
-- 제안은 옛 digests.title 기반 title을 그대로 들고 있어 배포 직후 목록에 두
-- 형식이 섞여 뜬다. closed는 그 시점 판단을 굳힌 기록이라 건드리지 않는다
-- (20260718090000의 title 백필과 같은 범위 판단).
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
