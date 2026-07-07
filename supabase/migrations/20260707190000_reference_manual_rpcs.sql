-- =============================================================
-- Reference 라이프사이클 완성 — 수동 수정·정리(archive)·연결 RPC (07-modeling.md)
--
-- #355가 만든 confirm_ingestion_review는 Reference의 create만 담당한다. 그 뒤
-- 사람이 Reference를 직접 다듬거나(modify) 접거나(archive), 관련 Reference를
-- 잇는(reference_links) 경로가 없었다. 07-modeling: reference는 create·modify·
-- archive를 다 쓰고, modify는 바뀐 필드만 {before, after}로 담아 그 Change
-- 하나로 자기완결 복원이 되게 한다.
--
-- 직접 쓰기는 #349 RLS가 SELECT-only라 이미 막혀 있다 — 이 RPC들만 경유
-- (SECURITY DEFINER). archive_source와 같은 계약: 사용자 경로(authenticated,
-- 멤버십 검증) + 운영자(service_role), auth.uid() NULL이면 운영자 통과.
--
-- Reference는 Workspace 스코프라 대상 changeset의 space_id는 비운다(07-modeling
-- §Changeset spaceId, changeset_model_v2 §4). 멤버십은 대상 Reference의
-- workspace_id로 is_workspace_member가 본다.
--
-- 이력 조회·workspace 읽기 정책·tRPC 노출·revert_changeset의 reference/modify
-- 확장·archived 복구(restore)는 화면 표면 설계 때 후속 — 지금은 쓰기 계약만.
-- =============================================================

-- =============================================================
-- 1) update_reference — Reference 직접 수정 (modify)
--
--   현재 값과 입력을 필드별로 대조해 바뀐 것만 {before, after}로 묶는다. 전체
--   상태를 받아 diff하는 방식(pending 초안 편집의 "전체 교체" 철학과 일관).
--   바뀐 게 없으면 RAISE — 빈 changeset을 남기지 않는다. active만 수정 대상
--   (archived된 걸 고치는 건 정리 취지에 어긋난다). relatedReferenceIds는
--   무방향 링크라 이 modify가 아니라 create_reference_link가 담당한다.
-- =============================================================

-- 전체 상태를 받아 diff하는 계약이라 p_external_urls도 필수 인자다 — DEFAULT를
-- 두면 "생략 = 빈 값으로 변경"이 되어 URL을 조용히 지우는 트랩이 된다.
CREATE FUNCTION update_reference(
  p_reference_id  uuid,
  p_type          reference_type,
  p_title         text,
  p_body          text,
  p_external_urls text[]
)
RETURNS uuid AS $$
DECLARE
  v_cur          record;
  v_new_urls     text[];
  v_before       jsonb := '{}'::jsonb;
  v_after        jsonb := '{}'::jsonb;
  v_changeset_id uuid;
BEGIN
  -- 빈 배열 → NULL 정규화 (create 경로가 URL 없을 때 NULL로 두는 것과 일관)
  v_new_urls := CASE
    WHEN p_external_urls IS NULL OR array_length(p_external_urls, 1) IS NULL THEN NULL
    ELSE p_external_urls
  END;

  SELECT r.workspace_id, r.type, r.title, r.body, r.external_urls
    INTO v_cur
  FROM "references" r
  WHERE r.id = p_reference_id AND r.status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(r.workspace_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can edit', p_reference_id;
  END IF;

  IF v_cur.type IS DISTINCT FROM p_type THEN
    v_before := v_before || jsonb_build_object('type', v_cur.type);
    v_after  := v_after  || jsonb_build_object('type', p_type);
  END IF;
  IF v_cur.title IS DISTINCT FROM p_title THEN
    v_before := v_before || jsonb_build_object('title', v_cur.title);
    v_after  := v_after  || jsonb_build_object('title', p_title);
  END IF;
  IF v_cur.body IS DISTINCT FROM p_body THEN
    v_before := v_before || jsonb_build_object('body', v_cur.body);
    v_after  := v_after  || jsonb_build_object('body', p_body);
  END IF;
  IF v_cur.external_urls IS DISTINCT FROM v_new_urls THEN
    v_before := v_before || jsonb_build_object('external_urls', to_jsonb(v_cur.external_urls));
    v_after  := v_after  || jsonb_build_object('external_urls', to_jsonb(v_new_urls));
  END IF;

  IF v_before = '{}'::jsonb THEN
    RAISE EXCEPTION 'reference % unchanged — nothing to modify', p_reference_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (NULL, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (
    v_changeset_id, 'modify', 'reference', p_reference_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  UPDATE "references"
  SET type = p_type, title = p_title, body = p_body, external_urls = v_new_urls
  WHERE id = p_reference_id;

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) archive_reference — Reference 정리 (archive)
--
--   manual changeset + {archive, reference}. data 없음(대상은 target_id로 충분).
--   과거 인용은 그대로 유효하다 — digest_references·statement_references는
--   reference_id를 ON DELETE CASCADE로만 걸어 hard delete(purge) 때만 끊기고,
--   archive(status 변경)는 링크 행을 건드리지 않는다. 벡터·notify 없음(Reference는
--   임베딩 대상이 아니다). archive_source와 같은 모양.
-- =============================================================

CREATE FUNCTION archive_reference(p_reference_id uuid)
RETURNS uuid AS $$
DECLARE
  v_workspace_id uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE "references"
  SET status = 'archived'
  WHERE id = p_reference_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  RETURNING workspace_id INTO v_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can archive', p_reference_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (NULL, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'reference', p_reference_id);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) create_reference_link — 관련 Reference 연결 (#349 쓰기 계약)
--
--   두 id를 정렬(작은 쪽을 a)해 chk_reference_link_ordered를 만족시키고, 양쪽
--   존재·멤버십을 검사한다 — #349 주석의 "직접 INSERT 금지" 계약을 캡슐화한다.
--   무방향 링크는 Reference 본문 필드가 아니라 별도 테이블이라 Change로 남기지
--   않는다(digest_references·statement_references 인용과 같은 결). purge 시엔
--   references ON DELETE CASCADE로 링크가 자동 삭제돼 별도 그물이 필요 없다.
--   재시도 멱등: ON CONFLICT DO NOTHING. same-workspace는 트리거가 강제하지만,
--   여기서 멤버십을 함께 봐 접근 불가 대상에 명확한 에러를 준다.
-- =============================================================

CREATE FUNCTION create_reference_link(p_a uuid, p_b uuid)
RETURNS void AS $$
DECLARE
  v_low  uuid;
  v_high uuid;
BEGIN
  IF p_a = p_b THEN
    RAISE EXCEPTION 'cannot link a reference to itself (%)', p_a;
  END IF;

  -- active만 링크 대상 (update_reference·archive_reference와 같은 가드) —
  -- 정리(archive)한 엔트리에 새 링크를 거는 건 실수일 가능성이 높다.
  IF NOT EXISTS (
    SELECT 1 FROM "references"
    WHERE id = p_a AND status = 'active'
      AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  ) THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can link', p_a;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "references"
    WHERE id = p_b AND status = 'active'
      AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  ) THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can link', p_b;
  END IF;

  IF p_a < p_b THEN
    v_low := p_a; v_high := p_b;
  ELSE
    v_low := p_b; v_high := p_a;
  END IF;

  INSERT INTO reference_links (reference_a_id, reference_b_id)
  VALUES (v_low, v_high)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 4) 인테이크 생성 경로에 Reference external_urls 배선
--
--   엔진이 Reference의 대표 링크(홈페이지·LinkedIn 등)를 뽑아 넘기게 됐다.
--   기존 write_ingestion_review_changes/confirm_ingestion_review는 reference를
--   type/title/body만 담아 URL을 버리고 있었다 — create Change data와 실제
--   INSERT 양쪽에 external_urls를 통과시킨다(각 Change가 자기완결이어야 확정·
--   되돌리기·purge가 changes만 보고 움직인다). 미인용 신규 레퍼런스 필터
--   (v_cited_keys, #356)는 그대로 보존한다 — external_urls 추가만이 유일한 변경.
-- =============================================================

CREATE OR REPLACE FUNCTION write_ingestion_review_changes(
  p_changeset_id    uuid,
  p_digests         jsonb,
  p_new_references  jsonb
)
RETURNS void AS $$
DECLARE
  v_item       jsonb;
  v_cited_keys jsonb;
  v_key_ids    jsonb := '{}'::jsonb;
  v_ref_id     uuid;
  v_digest_id  uuid;
  v_ref_ids    jsonb;
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

  -- 원본이 리뷰 대기 상태여야 한다 — 휴지통으로 간 원본의 리뷰는 확정 불가
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
      -- DO UPDATE는 충돌 시 RETURNING을 켜는 관용구(기존 주제 재사용도 id 반환)
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

  -- 리뷰 확정 = 원본 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  -- extraction_status는 pending 그대로라 게이트가 열리는 순간 추출 대상이 된다.
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- (write_ingestion_review_changes/confirm_ingestion_review의 기존 권한은
--  CREATE OR REPLACE가 보존한다 — 시그니처 불변)
-- =============================================================

REVOKE ALL ON FUNCTION update_reference(uuid, reference_type, text, text, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_reference(uuid, reference_type, text, text, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION archive_reference(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_reference(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION create_reference_link(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_reference_link(uuid, uuid) TO authenticated, service_role;
