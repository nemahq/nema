-- =============================================================
-- #27 Reference 독립 존재 + #28 리뷰 라벨 공유 팔레트 + #30 스냅샷 id 얼리기
--
-- 셋 다 같은 ingestion 리뷰 확정 RPC 군(create_ingestion_review·
-- write_ingestion_review_changes·update_pending_ingestion·confirm_ingestion_review)을
-- 건드려 한 마이그레이션으로 묶는다(따로 배포하면 파일 타임스탬프 드리프트 위험).
--
-- #27 — Reference는 인용이 아니라 등록으로 존재한다. 인용 안 된 신규 Reference
-- 제안을 조용히 버리던 가드(#356, 20260707150000)를 뗀다. 사람이 원치 않는
-- Reference 후보는 리뷰 화면에서 직접 지운다(review-flow.md "Digest 후보 삭제" —
-- Reference 후보도 같은 경로로 이미 지원됨, reviewDraft.ts의 reference/remove).
--
-- #28 — 리뷰 초안의 Topic/Tag를 Digest 후보마다 통째로 복사해 들던 것을,
-- changesets.label_draft 하나에 담는 리뷰 레벨 공유 팔레트로 바꾼다. 각 Digest는
-- 이제 팔레트 항목 id 배열만 들고 다닌다(새 Reference가 changes 행 id로 참조되는
-- 것과 같은 결). 확정 시 어디에도 안 붙은 팔레트 항목은 레지스트리에 안 쓴다.
-- Topic/Tag는 07-modeling.md상 changeset이 추적하는 대상이 아니라(Change.targetType
-- 밖) change_target_type enum을 늘리지 않고 changesets 전용 컬럼에 둔다.
--
-- #30 — draft_snapshot(20260727090000)이 채워지는 시점엔 아직 digest·reference의
-- 최종 id가 없어(write_ingestion_review_changes가 그 다음 줄에서 gen_random_uuid()로
-- 부여) 스냅샷 항목과 최종 초안 항목을 이을 키가 없었다. id 부여를 create_ingestion_review
-- 안으로 당겨 스냅샷 저장보다 먼저 하도록 순서만 바꾼다.
-- =============================================================

-- ----- 1) 스키마 -----

ALTER TABLE changesets ADD COLUMN label_draft jsonb;

COMMENT ON COLUMN changesets.label_draft IS
  '리뷰 초안의 Topic/Tag 공유 팔레트 — {"topics":[{"id","title"}],"tags":[{"id","title","description","color"}]}. 모든 Digest 후보가 이 팔레트 항목을 id로 참조한다(#28). status=open인 ingestion/revert changeset에서만 의미 있다.';

-- ----- 2) 기존 리뷰 백필 -----
--
-- 각 digest가 따로 들고 있던 {id,title}/{id,title,description,color} 복사본들을
-- changeset 하나당 팔레트 하나로 합친다(제목 기준 dedupe — 같은 제목이 여러
-- digest에 있으면 먼저 나온 값의 설명·색이 대표로 남는다. 정확히 #28이 고치려는
-- "먼저 처리된 쪽만 남는" 문제와 같은 결이지만, 백필은 과거 데이터를 1회
-- 정리하는 것이지 그 문제 자체를 없애는 건 아니다 — 실사용 중인 필드가
-- 적었던 시점의 자료라 실질 영향은 제한적으로 본다). 각 digest의 topics/tags는
-- 팔레트 id 배열로 치환한다.
--
-- status 제한 없이(open은 물론 closed도) 전부 돌린다 — 20260727120000과 같은
-- 이유다. 이미 확정(closed)된 ingestion changeset도 revert_changeset이 나중에
-- 그 changes.data를 그대로 복사해 새 open changeset을 연다(재판정 초안). 여기서
-- open만 백필하면, 그 되돌리기가 옛 형태 digest data + label_draft=NULL인 open
-- changeset을 만들어 getReview의 스키마 파싱이 그 자리에서 터진다.
DO $$
DECLARE
  cs                  RECORD;
  dg                  RECORD;
  v_topic_item        jsonb;
  v_tag_item          jsonb;
  v_topic_id_by_title jsonb;
  v_tag_id_by_title   jsonb;
  v_topic_palette     jsonb;
  v_tag_palette       jsonb;
  v_topic_id          uuid;
  v_tag_id            uuid;
  v_topic_ids         jsonb;
  v_tag_ids           jsonb;
BEGIN
  FOR cs IN
    SELECT id FROM changesets WHERE type IN ('ingestion', 'revert')
  LOOP
    v_topic_id_by_title := '{}'::jsonb;
    v_tag_id_by_title := '{}'::jsonb;
    v_topic_palette := '[]'::jsonb;
    v_tag_palette := '[]'::jsonb;

    FOR dg IN
      SELECT id, data FROM changes
      WHERE changeset_id = cs.id AND target_type = 'digest' AND action = 'create'
    LOOP
      FOR v_topic_item IN SELECT value FROM jsonb_array_elements(coalesce(dg.data->'topics', '[]'::jsonb))
      LOOP
        CONTINUE WHEN btrim(coalesce(v_topic_item->>'title', '')) = '';
        CONTINUE WHEN v_topic_id_by_title ? (v_topic_item->>'title');
        v_topic_id := gen_random_uuid();
        v_topic_id_by_title := v_topic_id_by_title || jsonb_build_object(v_topic_item->>'title', v_topic_id::text);
        v_topic_palette := v_topic_palette || jsonb_build_array(
          jsonb_build_object('id', v_topic_id, 'title', v_topic_item->>'title')
        );
      END LOOP;

      FOR v_tag_item IN SELECT value FROM jsonb_array_elements(coalesce(dg.data->'tags', '[]'::jsonb))
      LOOP
        CONTINUE WHEN btrim(coalesce(v_tag_item->>'title', '')) = '';
        CONTINUE WHEN v_tag_id_by_title ? (v_tag_item->>'title');
        v_tag_id := gen_random_uuid();
        v_tag_id_by_title := v_tag_id_by_title || jsonb_build_object(v_tag_item->>'title', v_tag_id::text);
        v_tag_palette := v_tag_palette || jsonb_build_array(
          jsonb_build_object(
            'id', v_tag_id, 'title', v_tag_item->>'title',
            'description', coalesce(v_tag_item->>'description', ''),
            'color', coalesce(v_tag_item->>'color', random_tag_color()::text)
          )
        );
      END LOOP;
    END LOOP;

    UPDATE changesets
    SET label_draft = jsonb_build_object('topics', v_topic_palette, 'tags', v_tag_palette)
    WHERE id = cs.id;

    FOR dg IN
      SELECT id, data FROM changes
      WHERE changeset_id = cs.id AND target_type = 'digest' AND action = 'create'
    LOOP
      SELECT coalesce(jsonb_agg(v_topic_id_by_title ->> (t.value->>'title')), '[]'::jsonb) INTO v_topic_ids
      FROM jsonb_array_elements(coalesce(dg.data->'topics', '[]'::jsonb)) AS t(value)
      WHERE btrim(coalesce(t.value->>'title', '')) <> '';

      SELECT coalesce(jsonb_agg(v_tag_id_by_title ->> (t.value->>'title')), '[]'::jsonb) INTO v_tag_ids
      FROM jsonb_array_elements(coalesce(dg.data->'tags', '[]'::jsonb)) AS t(value)
      WHERE btrim(coalesce(t.value->>'title', '')) <> '';

      UPDATE changes
      SET data = (dg.data - 'topics' - 'tags') || jsonb_build_object('topics', v_topic_ids, 'tags', v_tag_ids)
      WHERE id = dg.id;
    END LOOP;
  END LOOP;

  -- 배포 순서 안전장치(20260727120000과 같은 사정) — 백필 이후에도 몇 분간
  -- 구 서버가 계속 요청을 받는 창에서, 그 서버가 옛 형태로 저장을 덮어쓰지
  -- 못하게 draft_version을 올려 새 서버 배포 후 NM012(새로고침 필요)로 막는다.
  UPDATE changesets
  SET draft_version = draft_version + 1
  WHERE type IN ('ingestion', 'revert') AND status = 'open';
END $$;

-- ----- 3) write_ingestion_review_changes -----
--
-- #27: 인용 안 된 신규 Reference를 거르던 v_cited_keys 가드를 뗀다. #30: id를
-- 더는 여기서 생성하지 않는다 — 호출부(create_ingestion_review)가 이미 부여한
-- v_item->>'id'를 그대로 쓴다. #28: topics/tags는 이미 팔레트 id 배열이라
-- (호출부가 조립) 그대로 저장한다 — 이 함수는 더는 라벨 조립을 모른다.
CREATE OR REPLACE FUNCTION write_ingestion_review_changes(
  p_changeset_id      uuid,
  p_digests           jsonb,
  p_new_references    jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_item       jsonb;
  v_pos        bigint;
  v_key_ids    jsonb := '{}'::jsonb;
  v_ref_id     uuid;
  v_digest_id  uuid;
  v_ref_ids    jsonb;
  v_before     text;
BEGIN
  FOR v_item, v_pos IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    v_ref_id := (v_item->>'id')::uuid;
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    VALUES (
      p_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type',          v_item->>'type',
        'title',         v_item->>'title',
        'body',          v_item->>'body',
        'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
      ),
      v_pos
    );
  END LOOP;

  -- 기존 Reference 병합 — 순서·인용 개념 없음(대상 정체성이 reference_id 자체).
  -- non-active면 조용히 스킵(워커 경로의 관대한 처리, 사용자 경로는
  -- update_pending_ingestion이 NM008로 따로 강제).
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_reference_updates, '[]'::jsonb))
  LOOP
    SELECT r.body INTO v_before
    FROM "references" r
    JOIN changesets c ON c.id = p_changeset_id
    JOIN spaces sp ON sp.id = c.space_id
    WHERE r.id = (v_item->>'reference_id')::uuid
      AND r.status = 'active'
      AND r.workspace_id = sp.workspace_id;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN v_before IS NOT DISTINCT FROM (v_item->>'body');
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'modify', 'reference', (v_item->>'reference_id')::uuid,
      jsonb_build_object(
        'before', jsonb_build_object('body', v_before),
        'after',  jsonb_build_object('body', v_item->>'body')
      )
    );
  END LOOP;

  FOR v_item, v_pos IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    v_digest_id := (v_item->>'id')::uuid;
    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id
      FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT v_key_ids ->> (value #>> '{}')
      FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs
    WHERE refs.ref_id IS NOT NULL;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    VALUES (
      p_changeset_id, 'create', 'digest', v_digest_id,
      (v_item - 'new_reference_keys' - 'id') || jsonb_build_object('reference_ids', v_ref_ids),
      v_pos
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 4) create_ingestion_review -----
--
-- #30: digest·신규 reference에 id를 먼저 부여한 뒤에야 draft_snapshot을 채운다
-- (이 함수 안에서 순서만 바꾼다 — write_ingestion_review_changes 호출은 그대로
-- 마지막). #28: 엔진이 낸 topics(string[])·tags({title,description}[])를 훑어
-- 제목 기준으로 dedupe한 팔레트를 조립하고, 각 digest의 topics/tags를 팔레트
-- id 배열로 치환한다(같은 제목 = 같은 팔레트 항목).
CREATE OR REPLACE FUNCTION create_ingestion_review(
  p_source_id         uuid,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id          uuid;
  v_workspace_id      uuid;
  v_source_title      text;
  v_changeset_id      uuid;
  v_item              jsonb;
  v_topic_item        jsonb;
  v_tag_item          jsonb;
  v_digests_with_ids  jsonb := '[]'::jsonb;
  v_refs_with_ids     jsonb := '[]'::jsonb;
  v_topic_palette     jsonb := '[]'::jsonb;
  v_tag_palette       jsonb := '[]'::jsonb;
  v_topic_id_by_title jsonb := '{}'::jsonb;
  v_tag_id_by_title   jsonb := '{}'::jsonb;
  v_topic_ids         jsonb;
  v_tag_ids           jsonb;
  v_topic_id          uuid;
  v_tag_id            uuid;
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL
  WHERE id = p_source_id AND digestion_status = 'pending' AND status = 'pending'
  RETURNING space_id, title INTO v_space_id, v_source_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;

  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — use complete_source_digestion for empty results';
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM spaces WHERE id = v_space_id;

  -- 신규 Reference id 선부여(#30)
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_refs_with_ids := v_refs_with_ids || jsonb_build_array(
      v_item || jsonb_build_object('id', gen_random_uuid())
    );
  END LOOP;

  -- Topic/Tag 팔레트 조립(#28) — 같은 제목은 같은 항목을 가리킨다. 여러 digest가
  -- 같은 이름의 새 tag를 다른 설명으로 내면 먼저 나온 설명이 팔레트에 남는다
  -- (사람이 팔레트를 한 번만 보고 확정하므로, 예전처럼 조용히 사라지는 게
  -- 아니라 애초에 하나뿐이다).
  --
  -- 활성 레지스트리에 이미 같은 이름이 있으면 새 id를 뽑지 않고 그 행의 id를
  -- 그대로 팔레트 id로 쓴다 — TagEditPanel.handleSelectExisting이 사용자가
  -- 검색으로 레지스트리 항목을 고를 때 하는 것과 대칭이다. 안 맞추면, 엔진이
  -- 이미 존재하는 태그를 재제안한 채 임의 uuid를 발급하고, 사람이 리뷰 화면에서
  -- 그 같은 레지스트리 항목을 검색해 다시 선택하면 서로 다른 id로 갈라져 한
  -- Digest에 같은 태그 칩이 두 개 붙는다.
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    FOR v_topic_item IN SELECT value FROM jsonb_array_elements(coalesce(v_item->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_topic_item #>> '{}', '')) = '';
      CONTINUE WHEN v_topic_id_by_title ? (v_topic_item #>> '{}');
      SELECT id INTO v_topic_id FROM topics
      WHERE space_id = v_space_id AND status = 'active' AND title = btrim(v_topic_item #>> '{}');
      IF NOT FOUND THEN
        v_topic_id := gen_random_uuid();
      END IF;
      v_topic_id_by_title := v_topic_id_by_title || jsonb_build_object(v_topic_item #>> '{}', v_topic_id::text);
      v_topic_palette := v_topic_palette || jsonb_build_array(
        jsonb_build_object('id', v_topic_id, 'title', v_topic_item #>> '{}')
      );
    END LOOP;

    FOR v_tag_item IN SELECT value FROM jsonb_array_elements(coalesce(v_item->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_tag_item->>'title', '')) = '';
      CONTINUE WHEN v_tag_id_by_title ? (v_tag_item->>'title');
      SELECT id INTO v_tag_id FROM tags
      WHERE workspace_id = v_workspace_id AND status = 'active' AND title = btrim(v_tag_item->>'title');
      IF NOT FOUND THEN
        v_tag_id := gen_random_uuid();
      END IF;
      v_tag_id_by_title := v_tag_id_by_title || jsonb_build_object(v_tag_item->>'title', v_tag_id::text);
      v_tag_palette := v_tag_palette || jsonb_build_array(
        jsonb_build_object(
          'id', v_tag_id, 'title', v_tag_item->>'title',
          'description', coalesce(v_tag_item->>'description', ''),
          'color', random_tag_color()
        )
      );
    END LOOP;
  END LOOP;

  -- Digest id 선부여(#30) + topics/tags를 팔레트 id 참조로 치환(#28)
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    SELECT coalesce(jsonb_agg(v_topic_id_by_title ->> (t.value #>> '{}')), '[]'::jsonb) INTO v_topic_ids
    FROM jsonb_array_elements(coalesce(v_item->'topics', '[]'::jsonb)) AS t(value)
    WHERE btrim(coalesce(t.value #>> '{}', '')) <> '';

    SELECT coalesce(jsonb_agg(v_tag_id_by_title ->> (t.value->>'title')), '[]'::jsonb) INTO v_tag_ids
    FROM jsonb_array_elements(coalesce(v_item->'tags', '[]'::jsonb)) AS t(value)
    WHERE btrim(coalesce(t.value->>'title', '')) <> '';

    v_digests_with_ids := v_digests_with_ids || jsonb_build_array(
      (v_item - 'topics' - 'tags') || jsonb_build_object(
        'id', gen_random_uuid(),
        'topics', coalesce(v_topic_ids, '[]'::jsonb),
        'tags', coalesce(v_tag_ids, '[]'::jsonb)
      )
    );
  END LOOP;

  -- author_id는 안 채운다 — ingestion은 엔진 산물이라 항상 null(07-modeling authorId
  -- 규칙). draft_snapshot·label_draft는 이 시점(추출 직후) 1회만 채워지고 이후 어떤
  -- 저장도 건드리지 않는다 — 최종 id가 이미 얼려진 채로 남는다(#30).
  INSERT INTO changesets (
    space_id, type, status, source_id, title,
    draft_version, draft_snapshot, label_draft
  )
  VALUES (
    v_space_id, 'ingestion', 'open', p_source_id, v_source_title, 1,
    jsonb_build_object(
      'digests', v_digests_with_ids,
      'new_references', v_refs_with_ids,
      'reference_updates', p_reference_updates
    ),
    jsonb_build_object('topics', v_topic_palette, 'tags', v_tag_palette)
  )
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, v_digests_with_ids, v_refs_with_ids, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 5) update_pending_ingestion -----
--
-- #27: 신규 Reference 후보를 더는 인용 여부로 거르지 않는다(v_cited_keys 가드
-- 제거) — 클라가 보낸 항목을 전부 유지하고, 빠진 id만(사용자가 명시적으로
-- 지운 것) DELETE한다. #28: p_label_draft(팔레트 전체)를 추가로 받아 그대로
-- 저장한다 — 팔레트는 이 화면에서 상시 CRUD되는 값이라 digest/reference처럼
-- id 기준 upsert할 필요 없이 매 저장 시 전체 교체로 충분하다(클라가 항상 현재
-- 팔레트 전체를 들고 있다).
--
-- 시그니처에 p_label_draft가 추가돼 CREATE OR REPLACE로 못 덮는다(인자 개수
-- 변경, 20260727090000·20260730100000과 같은 사정) — DROP 후 재생성한다.
DROP FUNCTION update_pending_ingestion(uuid, integer, jsonb, jsonb, jsonb);

CREATE FUNCTION update_pending_ingestion(
  p_changeset_id      uuid,
  p_expected_version  integer,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb,
  p_label_draft       jsonb DEFAULT '{"topics":[],"tags":[]}'::jsonb
)
RETURNS integer AS $$
DECLARE
  v_status       changeset_status;
  v_type         changeset_type;
  v_version      integer;
  v_new_version  integer;
  v_item         jsonb;
  v_ref_id       uuid;
  v_digest_id    uuid;
  v_ref_ids      jsonb;
  v_before       text;
  v_keep_refs    uuid[] := '{}';
  v_keep_digests uuid[] := '{}';
BEGIN
  SELECT status, type, draft_version INTO v_status, v_type, v_version
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;
  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — trash the source instead';
  END IF;

  IF v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'ingestion review % draft version mismatch (expected %, got %) — refresh',
      p_changeset_id, v_version, p_expected_version
      USING ERRCODE = 'NM012';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_reference_updates, '[]'::jsonb)) AS upd(value)
    JOIN changesets c ON c.id = p_changeset_id
    JOIN spaces sp ON sp.id = c.space_id
    LEFT JOIN "references" r
      ON r.id = (upd.value->>'reference_id')::uuid
     AND r.workspace_id = sp.workspace_id
     AND r.status = 'active'
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'a reference being merged was archived or removed since review — refresh'
      USING ERRCODE = 'NM008';
  END IF;

  -- ----- 신규 Reference 후보: id 기준 upsert(#27 — 인용 여부와 무관하게 전부 유지) -----
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := (v_item->>'id')::uuid;
    v_keep_refs := array_append(v_keep_refs, v_ref_id);

    UPDATE changes
    SET data = jsonb_build_object(
          'type',          v_item->>'type',
          'title',         v_item->>'title',
          'body',          v_item->>'body',
          'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
        ),
        position = (v_item->>'position')::integer
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
      AND target_id = v_ref_id;

    IF NOT FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
      VALUES (
        p_changeset_id, 'create', 'reference', v_ref_id,
        jsonb_build_object(
          'type',          v_item->>'type',
          'title',         v_item->>'title',
          'body',          v_item->>'body',
          'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
        ),
        (v_item->>'position')::integer
      );
    END IF;
  END LOOP;

  -- 페이로드에서 빠진 id = 사용자가 그 사이 후보를 직접 삭제함(#27이 기대는
  -- 유일한 제거 경로 — 더는 미인용을 이유로 서버가 대신 지우지 않는다)
  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
    AND NOT (target_id = ANY(v_keep_refs));

  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'modify';

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_reference_updates, '[]'::jsonb))
  LOOP
    SELECT r.body INTO v_before
    FROM "references" r
    JOIN changesets c ON c.id = p_changeset_id
    JOIN spaces sp ON sp.id = c.space_id
    WHERE r.id = (v_item->>'reference_id')::uuid
      AND r.status = 'active'
      AND r.workspace_id = sp.workspace_id;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN v_before IS NOT DISTINCT FROM (v_item->>'body');

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'modify', 'reference', (v_item->>'reference_id')::uuid,
      jsonb_build_object(
        'before', jsonb_build_object('body', v_before),
        'after',  jsonb_build_object('body', v_item->>'body')
      )
    );
  END LOOP;

  -- ----- Digest 후보: id 기준 upsert — topics/tags는 팔레트 id 배열 그대로 통과 -----
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    v_digest_id := (v_item->>'id')::uuid;
    v_keep_digests := array_append(v_keep_digests, v_digest_id);

    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs
    WHERE refs.ref_id IS NOT NULL;

    UPDATE changes
    SET data = (v_item - 'new_reference_keys' - 'id' - 'position') || jsonb_build_object('reference_ids', v_ref_ids),
        position = (v_item->>'position')::integer
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
      AND target_id = v_digest_id;

    IF NOT FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
      VALUES (
        p_changeset_id, 'create', 'digest', v_digest_id,
        (v_item - 'new_reference_keys' - 'id' - 'position') || jsonb_build_object('reference_ids', v_ref_ids),
        (v_item->>'position')::integer
      );
    END IF;
  END LOOP;

  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
    AND NOT (target_id = ANY(v_keep_digests));

  UPDATE changesets
  SET draft_version = draft_version + 1,
      label_draft = p_label_draft
  WHERE id = p_changeset_id
  RETURNING draft_version INTO v_new_version;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION update_pending_ingestion(uuid, integer, jsonb, jsonb, jsonb, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION update_pending_ingestion(uuid, integer, jsonb, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

-- ----- 6) confirm_ingestion_review -----
--
-- #28: label_draft 팔레트 중 실제로 어느 digest에라도 붙은(id가 그 digest
-- change.data->'topics'|'tags'에 있는) 항목만 find-or-create한다 — 어디에도
-- 안 붙은 팔레트 항목은 그냥 레지스트리에 안 쓴다(확정 시 경고 없음, ambient
-- 상태 표시만으로 충분하다는 결정). 제목 기준 find-or-create가 이제 리뷰
-- 하나에 그 제목의 항목이 하나뿐이므로(팔레트가 이미 dedupe됐다), "먼저
-- 처리된 후보만 남고 설명이 조용히 사라지는" 문제 자체가 구조적으로 없어진다.
-- #27: Source.status: active의 정의가 "확정된 Digest가 있음"에서 "사람이 이
-- 리뷰를 확정함"으로 바뀌었다(07-modeling.md) — 이 UPDATE 자체는 그대로다
-- (지금 p_digests가 항상 비어있지 않아야 하는 가드가 남아있어 실질 동작
-- 차이는 없다. 주석만 새 정의를 반영한다).
CREATE OR REPLACE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id        uuid;
  v_source_id       uuid;
  v_status          changeset_status;
  v_type            changeset_type;
  v_author_id       uuid;
  v_author_name     text;
  v_closed_by_id    uuid;
  v_workspace_id    uuid;
  v_label_draft     jsonb;
  v_attached_topics jsonb;
  v_attached_tags   jsonb;
  v_topic_id_map    jsonb := '{}'::jsonb;
  v_tag_id_map      jsonb := '{}'::jsonb;
  ch                record;
  v_item            jsonb;
  v_topic_id        uuid;
  v_tag_id          uuid;
  v_ref             text;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.type, c.label_draft
    INTO v_space_id, v_source_id, v_status, v_type, v_label_draft
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;

  -- 원문이 리뷰 대기 상태여야 한다 — 휴지통으로 간 원문의 리뷰는 확정 불가
  SELECT s.author_id, s.author_name, sp.workspace_id INTO v_author_id, v_author_name, v_workspace_id
  FROM sources s JOIN spaces sp ON sp.id = s.space_id
  WHERE s.id = v_source_id AND s.status = 'pending'
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not awaiting review', v_source_id;
  END IF;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
  LOOP
    INSERT INTO "references" (id, workspace_id, type, title, body, external_urls)
    VALUES (
      ch.target_id, v_workspace_id,
      (ch.data->>'type')::reference_type, ch.data->>'title', ch.data->>'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END
    );
  END LOOP;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'modify'
  LOOP
    UPDATE "references"
    SET body = ch.data->'after'->>'body'
    WHERE id = ch.target_id AND workspace_id = v_workspace_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reference % was archived or removed since review — refresh', ch.target_id
        USING ERRCODE = 'NM008';
    END IF;
  END LOOP;

  -- 이 리뷰의 모든 digest가 실제로 참조하는 팔레트 id 집합(#28 attachment gate)
  SELECT coalesce(jsonb_agg(DISTINCT t.id), '[]'::jsonb) INTO v_attached_topics
  FROM changes c, jsonb_array_elements_text(coalesce(c.data->'topics', '[]'::jsonb)) AS t(id)
  WHERE c.changeset_id = p_changeset_id AND c.target_type = 'digest' AND c.action = 'create';

  SELECT coalesce(jsonb_agg(DISTINCT t.id), '[]'::jsonb) INTO v_attached_tags
  FROM changes c, jsonb_array_elements_text(coalesce(c.data->'tags', '[]'::jsonb)) AS t(id)
  WHERE c.changeset_id = p_changeset_id AND c.target_type = 'digest' AND c.action = 'create';

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_label_draft->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN NOT (v_attached_topics ? (v_item->>'id'));
    CONTINUE WHEN btrim(coalesce(v_item->>'title', '')) = '';
    INSERT INTO topics (space_id, title)
    VALUES (v_space_id, btrim(v_item->>'title'))
    ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_topic_id;
    v_topic_id_map := v_topic_id_map || jsonb_build_object(v_item->>'id', v_topic_id::text);
  END LOOP;

  -- 기존 태그의 정의(description)·색(color)은 덮지 않는다(재사용 판단 기준·
  -- 사용자가 고른 값이라는 이유는 그대로). 팔레트가 이미 dedupe됐으므로 이제
  -- 이 리뷰 안에서 같은 제목이 서로 다른 설명으로 두 번 처리될 일 자체가 없다.
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_label_draft->'tags', '[]'::jsonb))
  LOOP
    CONTINUE WHEN NOT (v_attached_tags ? (v_item->>'id'));
    CONTINUE WHEN btrim(coalesce(v_item->>'title', '')) = '';
    INSERT INTO tags (workspace_id, title, description, color)
    VALUES (
      v_workspace_id, btrim(v_item->>'title'), coalesce(v_item->>'description', ''),
      coalesce((v_item->>'color')::tag_color, random_tag_color())
    )
    ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_tag_id;
    v_tag_id_map := v_tag_id_map || jsonb_build_object(v_item->>'id', v_tag_id::text);
  END LOOP;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
  LOOP
    INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name)
    VALUES (
      ch.target_id, v_source_id, v_space_id,
      ch.data->>'title', ch.data->>'description', ch.data->'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END,
      v_author_id, v_author_name
    );

    FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN NOT (v_topic_id_map ? v_ref);
      INSERT INTO digest_topics (digest_id, topic_id)
      VALUES (ch.target_id, (v_topic_id_map ->> v_ref)::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN NOT (v_tag_id_map ? v_ref);
      INSERT INTO digest_tags (digest_id, tag_id)
      VALUES (ch.target_id, (v_tag_id_map ->> v_ref)::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_ref IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'reference_ids', '[]'::jsonb))
    LOOP
      INSERT INTO digest_references (digest_id, reference_id)
      VALUES (ch.target_id, v_ref::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'applied',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이. active의 정의는 "확정된 Digest가 있음"이
  -- 아니라 "사람이 이 원문의 리뷰를 확정함"이다(07-modeling.md #27) — 이
  -- UPDATE는 그 정의를 그대로 실행한다.
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- 7) revert_changeset -----
--
-- #28: ingestion 재판정 초안(reopen)이 원본 changeset의 digest create-Change를
-- data·position 그대로 복사해 새 changeset(v_revert_id)에 심는다 — 그 data.topics/
-- data.tags는 이제 원본 changeset.label_draft를 가리키는 id 배열이다. 새
-- changeset이 자기 label_draft를 안 가지면, 그 id들이 가리킬 팔레트가 없어
-- confirm_ingestion_review가 아무 것도 못 찾고 라벨을 조용히 다 빠뜨린다 —
-- 원본의 label_draft를 그대로 복사해 새 changeset에도 심어 이 회귀를 막는다.
-- 나머지 본문은 20260731093000과 동일, SELECT에 label_draft 한 컬럼만 늘고
-- INSERT에 그 값을 얹는다.
CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid, p_title text)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_status        changeset_status;
  v_outcome       changeset_outcome;
  v_source_id     uuid;
  v_label_draft   jsonb;
  v_author_id     uuid;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
  v_reopen_kind   text;  -- 'ingestion' | 'relation' | NULL
BEGIN
  SELECT space_id, type, status, outcome, source_id, label_draft
    INTO v_space_id, v_type, v_status, v_outcome, v_source_id, v_label_draft
  FROM changesets
  WHERE id = p_changeset_id
    AND (
      auth.uid() IS NULL
      OR is_space_member(space_id)
      OR (
        space_id IS NULL
        AND EXISTS (
          SELECT 1 FROM changes ch
          JOIN "references" r ON r.id = ch.target_id
          WHERE ch.changeset_id = p_changeset_id
            AND ch.target_type = 'reference'
            AND is_workspace_member(r.workspace_id)
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must not be empty';
  END IF;

  IF v_status <> 'closed' OR v_outcome IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'changeset % is not closed+applied — nothing to revert', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF (v_type = 'relation' OR v_type = 'revert')
     AND changeset_is_relation_judgment_shaped(p_changeset_id) THEN
    v_reopen_kind := 'relation';
  ELSIF v_type = 'ingestion'
     OR (v_type = 'revert' AND changeset_is_ingestion_shaped(p_changeset_id)) THEN
    v_reopen_kind := 'ingestion';
  ELSE
    v_reopen_kind := NULL;  -- manual, 확신 관계(supports/replaces/resolves) 등
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (
    space_id, type, status, outcome, reverts_id, author_id, author_name, title,
    source_id, draft_version, label_draft, closed_by_id, closed_by_name
  )
  VALUES (
    v_space_id, 'revert',
    (CASE WHEN v_reopen_kind IS NOT NULL THEN 'open' ELSE 'closed' END)::changeset_status,
    (CASE WHEN v_reopen_kind IS NOT NULL THEN NULL ELSE 'applied' END)::changeset_outcome,
    p_changeset_id, v_author_id, resolve_user_display_name(v_author_id), p_title,
    CASE WHEN v_reopen_kind = 'ingestion' THEN v_source_id END,
    CASE WHEN v_reopen_kind = 'ingestion' THEN 1 END,
    CASE WHEN v_reopen_kind = 'ingestion' THEN v_label_draft END,
    CASE WHEN v_reopen_kind IS NULL THEN v_author_id END,
    CASE WHEN v_reopen_kind IS NULL THEN resolve_user_display_name(v_author_id) END
  )
  RETURNING id INTO v_revert_id;

  IF v_reopen_kind = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'pending'
    WHERE id = v_source_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_revert_id, 'archive', 'source', v_source_id);
      v_did_anything := true;
    END IF;
  END IF;

  FOR v_ch IN
    SELECT action, target_type, target_id FROM changes WHERE changeset_id = p_changeset_id
  LOOP
    IF v_ch.action IN ('create', 'restore') THEN
      v_inverse := 'archive';
    ELSIF v_ch.action = 'archive' THEN
      v_inverse := 'restore';
    ELSE
      CONTINUE;
    END IF;

    IF v_ch.target_type = 'reference' AND v_inverse = 'archive' THEN
      CONTINUE;
    END IF;

    IF v_inverse = 'archive' THEN
      IF v_ch.target_type = 'statement' THEN
        UPDATE statements SET status = 'archived', ingestion_status = 'pending'
        WHERE id = v_ch.target_id AND status = 'active';
        IF FOUND THEN v_touched_stmt := true; ELSE CONTINUE; END IF;
      ELSIF v_ch.target_type = 'relation' THEN
        UPDATE statement_relations SET status = 'archived'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'digest' THEN
        UPDATE digests SET status = 'archived'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSE
        CONTINUE;
      END IF;
    ELSE  -- restore
      IF v_ch.target_type = 'statement' THEN
        UPDATE statements SET status = 'active', ingestion_status = 'pending'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF FOUND THEN v_touched_stmt := true; ELSE CONTINUE; END IF;
      ELSIF v_ch.target_type = 'relation' THEN
        UPDATE statement_relations SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'digest' THEN
        UPDATE digests SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'reference' THEN
        UPDATE "references" SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSE
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

  IF v_reopen_kind = 'ingestion' THEN
    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    SELECT v_revert_id, 'create', 'digest', gen_random_uuid(), data, position
    FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create';
    v_did_anything := true;
  ELSIF v_reopen_kind = 'relation' THEN
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    SELECT v_revert_id, 'create', 'relation', gen_random_uuid(), data
    FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'relation' AND action = 'create'
      AND data->>'type' IN ('conflicts', 'duplicates');
    v_did_anything := true;
  END IF;

  IF NOT v_did_anything THEN
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;
