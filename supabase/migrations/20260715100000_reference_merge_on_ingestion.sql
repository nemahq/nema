-- =============================================================
-- 기존 Reference 병합 편집 — 인테이크 리뷰에서 기존 Reference의 설명 다듬기
-- (review-flow.md "기존 Reference 후보 병합 편집", glossary "새로 쌓이지 않고
--  기존 것이 다듬어진다")
--
-- 지금까지 인테이크 confirm은 Reference의 create만 적용했다(#355). 기존 Reference가
-- 다시 언급돼 새 정보가 생겨도 그 설명(references.body)은 손대지 않고 인용만 걸렸다.
-- 이제 엔진이 '기존 설명 + 새 정보'를 녹인 완성본을 제안하면, 사람이 확정 전 다듬어
-- 확정 시 references.body를 통째로 교체한다 — update_reference의 in-place modify와
-- 같은 계약({before, after} Change, 각 Change가 자기완결이라 확정·되돌리기가 changes만
-- 보고 움직인다).
--
-- 세 적재 RPC(write_ingestion_review_changes/create_ingestion_review/
-- update_pending_ingestion)에 p_reference_updates(원소 { "reference_id", "body" })를
-- 더한다 — 인자 개수가 바뀌어 CREATE OR REPLACE로는 못 덮으므로 DROP 후 재생성한다.
-- confirm_ingestion_review는 시그니처가 그대로라 REPLACE로 modify 적용만 얹는다.
--
-- 동시성: 리뷰 도중 병합 대상 Reference가 정리(archive/trash)되면, 사용자가 직접 쓴
-- 병합 설명이 조용히 유실된 채 확정이 성공으로 보이는 걸 막는다 — 사용자 경로
-- (update_pending 저장 시·confirm 적용 시)는 NM008(ingestion_review_state_changed)로
-- 막아 새로고침을 유도하고, 워커(create) 경로는 리뷰 생성을 막지 않도록 관대히 스킵한다.
-- =============================================================

DROP FUNCTION update_pending_ingestion(uuid, jsonb, jsonb);
DROP FUNCTION create_ingestion_review(uuid, jsonb, jsonb);
DROP FUNCTION write_ingestion_review_changes(uuid, jsonb, jsonb);

-- ----- 후보 적재의 공통 몸통 — Digest·신규 Reference create + 기존 Reference modify -----
CREATE FUNCTION write_ingestion_review_changes(
  p_changeset_id      uuid,
  p_digests           jsonb,
  p_new_references    jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_item       jsonb;
  v_cited_keys jsonb;
  v_key_ids    jsonb := '{}'::jsonb;
  v_ref_id     uuid;
  v_digest_id  uuid;
  v_ref_ids    jsonb;
  v_before     text;
BEGIN
  -- 인용된 key 집합 — 여기 없는 신규 레퍼런스 제안은 적재하지 않는다 (#356)
  SELECT coalesce(jsonb_agg(DISTINCT cited.key), '[]'::jsonb) INTO v_cited_keys
  FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb)) AS digest(value),
       jsonb_array_elements_text(coalesce(digest.value->'new_reference_keys', '[]'::jsonb)) AS cited(key);

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    CONTINUE WHEN NOT (v_cited_keys ? (v_item->>'key'));
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type',          v_item->>'type',
        'title',         v_item->>'title',
        'body',          v_item->>'body',
        'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
      )
    );
  END LOOP;

  -- 기존 Reference 병합 — 대상은 확정 전 다듬을 값이므로 지금 원본 body를 before로
  -- 잡아 {before, after}로 자기완결하게 남긴다. before/after 형태는 update_reference와
  -- 같지만 archive된 대상 처리 정책은 다르다: 여기(공통 헬퍼)는 non-active면 조용히
  -- 스킵한다 — 워커(create) 경로에서 생성~적재 사이 대상이 정리돼도 리뷰 생성 전체를
  -- 막지 않기 위함이다. 사용자가 직접 쓴 병합이 조용히 유실되지 않도록 하는 엄격성은
  -- 사용자 경로(update_pending_ingestion·confirm)가 NM008로 따로 강제한다.
  -- 대상은 이 changeset의 워크스페이스 소속 active Reference만 — 다른 워크스페이스 id를
  -- 실은 draft가 남의 body를 before 스냅샷으로 끌어오지 못하게 막는다(confirm의 workspace
  -- 가드와 이중). 실제 변화가 없으면 빈 modify를 안 만든다. 인용·중복 필터는 호출부가
  -- 책임진다(worker=normalize, user=FE) — p_new_references와 같은 신뢰 계약.
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

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    v_digest_id := gen_random_uuid();
    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id
      FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT v_key_ids ->> (value #>> '{}')
      FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs
    WHERE refs.ref_id IS NOT NULL;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'digest', v_digest_id,
      (v_item - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 워커 적재 경로 -----
CREATE FUNCTION create_ingestion_review(
  p_source_id         uuid,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_author_id    uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL
  WHERE id = p_source_id AND digestion_status = 'pending' AND status = 'pending'
  RETURNING space_id, author_id INTO v_space_id, v_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;

  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — use complete_source_digestion for empty results';
  END IF;

  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 초안 편집 — 전체 상태로 changes를 통째로 교체 -----
CREATE FUNCTION update_pending_ingestion(
  p_changeset_id      uuid,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_status changeset_status;
  v_type   changeset_type;
BEGIN
  SELECT status, type INTO v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;
  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — trash the source instead';
  END IF;

  -- 사용자가 병합 설명을 쓰는 사이 그 Reference가 정리(archive/trash)됐으면, 그대로
  -- 저장하면 write 헬퍼가 조용히 스킵해 사람이 직접 쓴 값이 유실된 채 확정이 성공으로
  -- 보인다. 워커의 관대한 스킵과 달리 사용자 경로는 여기서 막아 새로고침을 유도한다.
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

  DELETE FROM changes WHERE changeset_id = p_changeset_id;
  PERFORM write_ingestion_review_changes(p_changeset_id, p_digests, p_new_references, p_reference_updates);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 확정 — 신규 Reference create + 기존 Reference modify + Digest 생성 -----
CREATE OR REPLACE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_author_id    uuid;
  v_workspace_id uuid;
  ch             record;
  v_name         text;
  v_topic_id     uuid;
  v_tag          jsonb;
  v_tag_id       uuid;
  v_ref          text;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.type
    INTO v_space_id, v_source_id, v_status, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;

  -- 원문이 리뷰 대기 상태여야 한다 — 휴지통으로 간 원문의 리뷰는 확정 불가
  SELECT s.author_id, sp.workspace_id INTO v_author_id, v_workspace_id
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

  -- 기존 Reference 병합 반영 — after.body로 통째 교체(updated_at은 트리거가 갱신).
  -- 저장~확정 사이 그 Reference가 정리(archive/trash)됐으면 사람이 쓴 병합이 조용히
  -- 유실된 채 확정만 성공한다 — status 가드에 0행이 걸리면 NM008로 막아 새로고침을
  -- 유도한다(update_pending의 저장 시 검사와 같은 취지, 그 사이 창을 여기서 닫는다).
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

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
  LOOP
    INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id)
    VALUES (
      ch.target_id, v_source_id, v_space_id,
      ch.data->>'title', ch.data->>'description', ch.data->'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END,
      v_author_id
    );

    -- 주제 레지스트리 find-or-create + 연결 (confirm_draft의 관용구 계승)
    FOR v_name IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(v_name) = '';
      INSERT INTO topics (space_id, name)
      VALUES (v_space_id, btrim(v_name))
      ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_topic_id;

      INSERT INTO digest_topics (digest_id, topic_id)
      VALUES (ch.target_id, v_topic_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- 태그 레지스트리 find-or-create — 기존 태그의 정의(description)는 덮지 않는다:
    -- 정의는 재사용 판단 기준이라 리뷰 한 번이 조용히 바꾸면 안 된다
    FOR v_tag IN
      SELECT value FROM jsonb_array_elements(coalesce(ch.data->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
      INSERT INTO tags (workspace_id, title, description)
      VALUES (v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''))
      ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
      RETURNING id INTO v_tag_id;

      INSERT INTO digest_tags (digest_id, tag_id)
      VALUES (ch.target_id, v_tag_id)
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

  UPDATE changesets SET status = 'applied' WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions — DROP이 기존 GRANT를 지우므로 재생성한 시그니처에 다시 부여한다.
-- (create_ingestion_review = 워커 전용 service_role, update_pending_ingestion =
--  사용자+운영자, write_ingestion_review_changes = 내부 헬퍼로 전부 차단)
-- =============================================================

REVOKE ALL ON FUNCTION write_ingestion_review_changes(uuid, jsonb, jsonb, jsonb)
  FROM public, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION create_ingestion_review(uuid, jsonb, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_ingestion_review(uuid, jsonb, jsonb, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION update_pending_ingestion(uuid, jsonb, jsonb, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION update_pending_ingestion(uuid, jsonb, jsonb, jsonb)
  TO authenticated, service_role;
