-- =============================================================
-- 중복(duplicates) pending relation changeset에 병합 초안 스냅샷 추가
--
-- 관계 엔진 2단계(worker.ts processLinking)가 duplicates 쌍을 pending으로 올릴 때,
-- 이제 병합 제안 Digest 초안(제목·본문·topics·tags·referenceIds — DigestDraftSchema와
-- 같은 모양)을 LLM으로 미리(eager) 만들어 함께 보낸다(surface-inventory.md
-- "관계 판정 화면(중복/병합)" — 판정 화면을 여는 순간 부르면 로딩 상태가 새로 생겨
-- 일관성이 깨진다는 이유로 즉시 생성이 이미 확정돼 있었다).
--
-- apply_relation_changesets는 p_pending 항목에 `merge_draft`가 실려 있으면(즉 duplicates
-- 이고 초안 생성이 성공했으면) 그걸 changes.data에 그대로 스냅샷하고, changeset.title도
-- "A vs B" 임시값 대신 그 초안의 title로 채운다(review-flow.md "Changeset 제목 자동 생성
-- (relation - 중복)" — 이전 PR #512가 "A vs B"로 남겨둔 stopgap을 여기서 해소한다).
-- 초안 생성이 실패했거나(LLM 오류 등) conflicts 쌍이면 merge_draft가 없으므로 기존
-- "A vs B" 동작으로 조용히 낮아진다 — 이 마이그레이션은 그 경로를 그대로 보존한다.
--
-- merge_draft 내부 키(camelCase, referenceIds/newReferenceKeys/externalUrls 등)는 SQL이
-- title 추출 외엔 건드리지 않고 changes.data에 그대로 얹기만 하므로 casing이 SQL과
-- 무관하다 — 다음 슬라이스(판정 화면)가 DigestDraftSchema로 그대로 읽는다.
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
  v_merge_draft  jsonb;
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

  -- ----- 사람 판정분: 건당 변경셋 1개. title = 끝점 Statement 내용 "A vs B", 단
  -- duplicates에 병합 초안이 실려 있으면 그 초안 제목 -----
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

    INSERT INTO changesets (space_id, type, status, source_id, title)
    VALUES (
      v_space_id, 'relation', 'open', p_source_id,
      CASE
        WHEN v_merge_draft IS NOT NULL THEN v_merge_draft->>'title'
        WHEN v_from_content IS NOT NULL AND v_to_content IS NOT NULL
          THEN v_from_content || ' vs ' || v_to_content
      END
    )
    RETURNING id INTO v_changeset_id;

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
