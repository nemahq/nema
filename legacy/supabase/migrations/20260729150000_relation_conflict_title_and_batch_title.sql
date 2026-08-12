-- =============================================================
-- 관계 판정 changeset 제목 2건 채움 — conflicts 요약 제목 + 확신 자동 적용 배치 제목
--
-- 1) conflicts pending: 지금까지 "A vs B"(끝점 Statement 원문 이어붙이기)만 썼는데,
-- 진술이 길면 구분자조차 안 보여 목록에서 스캔이 안 됐다. 관계 판정 LLM 콜
-- (worker.ts callJudgment)이 conflicts일 때 이미 "뭐가 부딪히는지" 요약한
-- conflictTitle을 함께 뽑도록 확장됐다(같은 콜에 출력 필드만 추가 — 새 LLM 콜 아님).
-- p_pending 항목에 conflict_title이 실려 있으면 그걸 title로 쓰고, 없으면(LLM이
-- 비웠거나 duplicates 등 무관 타입) 기존 "A vs B"로 조용히 낮아진다 — duplicates의
-- merge_draft.title 우선순위 위에 conflict_title을 끼워 넣는 형태(review-flow.md
-- "Changeset 제목 자동 생성 (relation - 충돌)").
--
-- 2) 확신 자동 적용 배치: 지금까지 title이 아예 null이었다. 이 changeset은 배치를
-- 촉발한 원문(source) 하나에서 나온 확신 연결들만 모은 거라 그 원문의 sources.title을
-- 그대로 빌려써도(1:1 관계) 겹칠 일이 없다. 항상 closed로 태어나고 title은 closed면
-- 얼어붙는 기존 규칙(07-modeling.md)이 그대로 적용되니 생성 시점 스냅샷 한 번으로
-- 충분하다 — 이후 sources.title이 바뀌어도 따라가지 않는다(review-flow.md
-- "확신 관계 자동 적용").
-- =============================================================

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id uuid,
  p_applied   jsonb DEFAULT '[]'::jsonb,
  p_pending   jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id       uuid;
  v_changeset_id   uuid;
  v_relation_id    uuid;
  v_item           jsonb;
  v_applied_any    boolean := false;
  v_source_title   text;
  v_from_content   text;
  v_to_content     text;
  v_merge_draft    jsonb;
  v_conflict_title text;
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
  RETURNING space_id, title INTO v_space_id, v_source_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending linking', p_source_id;
  END IF;

  -- ----- 자동 적용분: 관계 행 생성 후, 실제로 생긴 게 있을 때만 변경셋을 묶는다 -----
  -- title은 이 배치를 촉발한 원문(source)의 제목을 그대로 차용한다.
  INSERT INTO changesets (space_id, type, status, outcome, source_id, title)
  VALUES (v_space_id, 'relation', 'closed', 'applied', p_source_id, v_source_title)
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

  -- ----- 사람 판정분: 건당 변경셋 1개. title 우선순위 = duplicates 병합 초안 title >
  -- conflicts 요약 title(conflict_title) > 끝점 Statement 내용 "A vs B" -----
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

    v_merge_draft := CASE
      WHEN v_item->>'type' = 'duplicates' THEN v_item->'merge_draft'
      ELSE NULL
    END;

    -- NULLIF: 빈 문자열은 미채움과 동일하게 취급해 "A vs B" 폴백을 그대로 타게 한다 —
    -- 지금 유일한 호출부(worker.ts)는 zod .min(1)로 빈 문자열을 걸러내 도달 못 하지만,
    -- 이 RPC를 직접 부르는 다른 경로(백필, 관리자 도구 등)가 생기면 방어선이 된다.
    v_conflict_title := NULLIF(
      CASE
        WHEN v_item->>'type' = 'conflicts' THEN v_item->>'conflict_title'
        ELSE NULL
      END,
      ''
    );

    INSERT INTO changesets (space_id, type, status, source_id, title)
    VALUES (
      v_space_id, 'relation', 'open', p_source_id,
      CASE
        WHEN v_merge_draft IS NOT NULL THEN v_merge_draft->>'title'
        WHEN v_conflict_title IS NOT NULL THEN v_conflict_title
        WHEN v_from_content IS NOT NULL AND v_to_content IS NOT NULL
          THEN v_from_content || ' vs ' || v_to_content
      END
    )
    RETURNING id INTO v_changeset_id;

    -- conflict_title은 changes.data에 안 싣는다 — merge_draft는 병합 제안 화면이 나중에
    -- 다시 읽어 편집해야 해서 스냅샷이 필요하지만, conflict_title은 title 컬럼에 쓰고 나면
    -- 끝인 값이라(관계 판정 화면이 따로 편집하지 않음) 더 저장할 이유가 없다.
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      v_changeset_id, 'create', 'relation', gen_random_uuid(),
      CASE
        WHEN v_merge_draft IS NOT NULL THEN
          jsonb_build_object(
            'type',        v_item->>'type',
            'from_id',     v_item->>'from_id',
            'to_id',       v_item->>'to_id',
            'merge_draft', v_merge_draft
          )
        ELSE
          jsonb_build_object(
            'type',    v_item->>'type',
            'from_id', v_item->>'from_id',
            'to_id',   v_item->>'to_id'
          )
      END
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
