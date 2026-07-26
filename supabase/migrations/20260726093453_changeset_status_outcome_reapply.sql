-- =============================================================
-- Changeset status/outcome 2필드 모델을 author_name/topic title 이후에 재적용
--
-- 이 branch(feat/changeset-status-outcome-model)가 20260726075454에서
-- status(open/closed)+outcome(applied/discarded) 2필드로 전환한 뒤, staging에
-- 병렬로 머지된 두 마이그레이션(20260726075509_author_name_snapshot,
-- 20260726080057_topic_title_rename)이 옛 스키마(changeset_status
-- pending/applied) 기준으로 같은 8개 함수를 다시 재정의했다. 파일명 타임스탬프
-- 순서상 그 재정의가 20260726075454보다 나중에 적용되므로, 그대로 두면 그
-- 재정의가 status/outcome 전환을 조용히 되돌린다(같은 함수 이름이라 텍스트
-- 충돌은 안 나지만 의미가 어긋난다).
--
-- 여기서는 그 두 마이그레이션이 이미 배포된 파일이라 손대지 않고(체크섬·drift
-- 위험), 그 마이그레이션들이 만든 *최신* 본문(author_name·topics.title 반영)
-- 위에 status/outcome 로직만 다시 얹어 재정의한다 — 그 외 어떤 줄도 바꾸지
-- 않았다.
--
-- 대상 8개: confirm_ingestion_review·confirm_digest_edit·resolve_duplicate_relation
-- (최신본은 20260726080057), archive_statement·archive_digest·update_reference·
-- archive_reference·revert_changeset(최신본은 20260726075509). 두 마이그레이션이
-- 함께 건드리는 나머지 함수(resolve_user_display_name·create_source·update_topic·
-- handle_new_user 등)는 changesets.status를 안 읽어 이 재적용 대상이 아니다.
-- list_manual_changes_for_target도 author_id/author_name만 SELECT할 뿐 status
-- 리터럴을 안 써서 마찬가지로 대상 밖이다.
-- =============================================================
-- ----- confirm_ingestion_review -----
CREATE OR REPLACE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_author_id    uuid;
  v_author_name  text;
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
  IF v_type <> 'ingestion' OR v_status <> 'open' THEN
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
    INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name)
    VALUES (
      ch.target_id, v_source_id, v_space_id,
      ch.data->>'title', ch.data->>'description', ch.data->'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END,
      v_author_id, v_author_name
    );

    -- 주제 레지스트리 find-or-create + 연결 (find-or-create 관용구)
    FOR v_name IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(v_name) = '';
      INSERT INTO topics (space_id, title)
      VALUES (v_space_id, btrim(v_name))
      ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
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

  UPDATE changesets SET status = 'closed', outcome = 'applied' WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- confirm_digest_edit -----
CREATE OR REPLACE FUNCTION confirm_digest_edit(
  p_digest_id      uuid,
  p_digest         jsonb,
  p_new_references jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_source_id    uuid;
  v_space_id     uuid;
  v_workspace_id uuid;
  v_author_id    uuid;
  v_author_name  text;
  v_changeset_id uuid;
  v_new_digest   uuid;
  v_key_ids      jsonb := '{}'::jsonb;
  v_ref_id       uuid;
  v_ref_ids      jsonb;
  v_item         jsonb;
  v_name         text;
  v_topic_id     uuid;
  v_tag          jsonb;
  v_tag_id       uuid;
  v_ref          text;
  v_stmt         uuid;
BEGIN
  -- 옛 Digest는 active여야 하고 호출자는 멤버여야 한다.
  SELECT d.source_id, d.space_id, sp.workspace_id
    INTO v_source_id, v_space_id, v_workspace_id
  FROM digests d JOIN spaces sp ON sp.id = d.space_id
  WHERE d.id = p_digest_id AND d.status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(d.space_id))
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'digest % is not an active digest the caller can edit', p_digest_id;
  END IF;

  -- 확정본 수정이라 원문이 active여야 한다(pending/trashed 원문의 digest는 수정 대상 아님).
  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'active') THEN
    RAISE EXCEPTION 'source % of digest % is not active', v_source_id, p_digest_id;
  END IF;

  v_author_id := auth.uid();
  v_author_name := resolve_user_display_name(v_author_id);

  -- manual changeset — source_id 유지(Y). 사람 주도라 author_id 채움.
  -- title = 새 Digest의 제목(수정 결과를 대표).
  INSERT INTO changesets (space_id, type, status, outcome, source_id, author_id, author_name, title)
  VALUES (v_space_id, 'manual', 'closed', 'applied', v_source_id, v_author_id, v_author_name, p_digest->>'title')
  RETURNING id INTO v_changeset_id;

  -- 신규 Reference 생성 + key→예약 id 매핑. external_urls를 INSERT·Change data 양쪽에
  -- 통과시킨다(#360 인테이크 경로와 같은 관용구 — 각 Change가 자기완결이어야 되돌리기·purge가 돈다).
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO "references" (id, workspace_id, type, title, body, external_urls)
    VALUES (
      v_ref_id, v_workspace_id,
      (v_item->>'type')::reference_type, v_item->>'title', v_item->>'body',
      CASE WHEN jsonb_array_length(coalesce(v_item->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(v_item->'external_urls'))
      END
    );
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type', v_item->>'type', 'title', v_item->>'title', 'body', v_item->>'body',
        'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
      ));
  END LOOP;

  -- 기존 인용(reference_ids) + 신규 인용(new_reference_keys→예약 id) 합치기
  SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
  FROM (
    SELECT value #>> '{}' AS ref_id
    FROM jsonb_array_elements(coalesce(p_digest->'reference_ids', '[]'::jsonb))
    UNION ALL
    SELECT v_key_ids ->> (value #>> '{}')
    FROM jsonb_array_elements(coalesce(p_digest->'new_reference_keys', '[]'::jsonb))
  ) refs
  WHERE refs.ref_id IS NOT NULL;

  -- 새 Digest 생성 (같은 source_id, 추출 대기)
  v_new_digest := gen_random_uuid();
  INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name, extraction_status)
  VALUES (
    v_new_digest, v_source_id, v_space_id,
    p_digest->>'title', p_digest->>'description', p_digest->'body',
    CASE WHEN jsonb_array_length(coalesce(p_digest->'external_urls', '[]'::jsonb)) > 0
      THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(p_digest->'external_urls'))
    END,
    v_author_id, v_author_name, 'pending'
  );

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (v_changeset_id, 'create', 'digest', v_new_digest,
    (p_digest - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids));

  -- 주제 find-or-create + 연결 (confirm_ingestion_review와 같은 관용구)
  FOR v_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_digest->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(v_name) = '';
    INSERT INTO topics (space_id, title)
    VALUES (v_space_id, btrim(v_name))
    ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_topic_id;
    INSERT INTO digest_topics (digest_id, topic_id)
    VALUES (v_new_digest, v_topic_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- 태그 find-or-create — 기존 태그 정의는 덮지 않는다(재사용 기준이라)
  FOR v_tag IN SELECT value FROM jsonb_array_elements(coalesce(p_digest->'tags', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
    INSERT INTO tags (workspace_id, title, description)
    VALUES (v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''))
    ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_tag_id;
    INSERT INTO digest_tags (digest_id, tag_id)
    VALUES (v_new_digest, v_tag_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Reference 인용 연결
  FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(v_ref_ids)
  LOOP
    INSERT INTO digest_references (digest_id, reference_id)
    VALUES (v_new_digest, v_ref::uuid) ON CONFLICT DO NOTHING;
  END LOOP;

  -- 옛 Digest archive + 기록
  UPDATE digests SET status = 'archived' WHERE id = p_digest_id;
  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'digest', p_digest_id);

  -- 옛 Digest의 active 진술 archive + 기록. ingestion_status='pending'으로 둬 임베딩
  -- 패스가 벡터를 지우게 한다(revert 경로와 동일). 걸린 관계는 status 트리거가 캐스케이드.
  FOR v_stmt IN SELECT id FROM statements WHERE digest_id = p_digest_id AND status = 'active'
  LOOP
    UPDATE statements SET status = 'archived', ingestion_status = 'pending' WHERE id = v_stmt;
    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_changeset_id, 'archive', 'statement', v_stmt);
  END LOOP;

  -- 재트리거: 새 Digest 추출(pending) + 재연결. 새 진술이 기존 활성 진술과 다시 대조되게
  -- linking도 pending으로 되돌린다(잇기 배치는 원문 단위라 전체 재판정).
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- resolve_duplicate_relation -----
CREATE OR REPLACE FUNCTION resolve_duplicate_relation(
  p_changeset_id   uuid,
  p_merged_digest  jsonb,
  p_new_references jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id       uuid;
  v_status         changeset_status;
  v_type           changeset_type;
  v_rel_type       text;
  v_from_id        uuid;  -- keeper 진술(A)
  v_to_id          uuid;  -- duplicate 진술(B)
  v_digest_a       uuid;
  v_digest_b       uuid;
  v_source_id      uuid;
  v_workspace_id   uuid;
  v_author_id      uuid;
  v_author_name    text;
  v_new_digest     uuid;
  v_key_ids        jsonb := '{}'::jsonb;
  v_ref_id         uuid;
  v_ref_ids        jsonb;
  v_item           jsonb;
  v_name           text;
  v_topic_id       uuid;
  v_tag            jsonb;
  v_tag_id         uuid;
  v_ref            text;
  v_stmt           uuid;
BEGIN
  SELECT space_id, status, type INTO v_space_id, v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'relation' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not a pending relation proposal', p_changeset_id;
  END IF;

  SELECT data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending relation changeset % has no relation change', p_changeset_id;
  END IF;
  IF v_rel_type <> 'duplicates' THEN
    RAISE EXCEPTION 'changeset % is not a duplicates proposal (use resolve_conflict_relation)', p_changeset_id;
  END IF;

  SELECT digest_id INTO v_digest_a FROM statements WHERE id = v_from_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'endpoint % no longer active for relation proposal %', v_from_id, p_changeset_id;
  END IF;
  SELECT digest_id INTO v_digest_b FROM statements WHERE id = v_to_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'endpoint % no longer active for relation proposal %', v_to_id, p_changeset_id;
  END IF;

  IF v_digest_a = v_digest_b THEN
    RAISE EXCEPTION 'duplicate statements % and % belong to the same digest % — merge does not apply', v_from_id, v_to_id, v_digest_a;
  END IF;

  -- 두 Digest 모두 active + 이 changeset과 같은 space여야 한다(끝점 무결성 + 방어적
  -- space 검사, statement_relations이 이론상 cross-space를 허용하는 스키마 주석과
  -- 무관하게 지금 엔진은 same-space 쌍만 만든다는 전제).
  IF NOT EXISTS (SELECT 1 FROM digests WHERE id = v_digest_a AND status = 'active' AND space_id = v_space_id)
     OR NOT EXISTS (SELECT 1 FROM digests WHERE id = v_digest_b AND status = 'active' AND space_id = v_space_id) THEN
    RAISE EXCEPTION 'endpoint digest no longer active or space mismatch for relation proposal %', p_changeset_id;
  END IF;

  -- 새 Digest의 source_id는 B(나중에 제출되어 병합을 촉발한 쪽)의 source를 따른다 —
  -- "리뷰어=B의 제출자" 규칙(surface-inventory.md "관계 판정 화면(중복/병합)" 소유 절)과
  -- 같은 "나중 것 기준" 관례의 연장. A의 source가 나중에 완전 삭제돼도 A의 archived
  -- Digest 행이 그 cascade로 정리될 뿐, 이 새 Digest는 B의 source에 안전하게 남는다.
  SELECT source_id INTO v_source_id FROM digests WHERE id = v_digest_b;
  SELECT workspace_id INTO v_workspace_id FROM spaces WHERE id = v_space_id;

  v_author_id := auth.uid();
  v_author_name := resolve_user_display_name(v_author_id);

  -- 신규 Reference 생성 + key→예약 id 매핑(confirm_digest_edit과 같은 관용구).
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO "references" (id, workspace_id, type, title, body, external_urls)
    VALUES (
      v_ref_id, v_workspace_id,
      (v_item->>'type')::reference_type, v_item->>'title', v_item->>'body',
      CASE WHEN jsonb_array_length(coalesce(v_item->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(v_item->'external_urls'))
      END
    );
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (p_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type', v_item->>'type', 'title', v_item->>'title', 'body', v_item->>'body',
        'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
      ));
  END LOOP;

  SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
  FROM (
    SELECT value #>> '{}' AS ref_id
    FROM jsonb_array_elements(coalesce(p_merged_digest->'reference_ids', '[]'::jsonb))
    UNION ALL
    SELECT v_key_ids ->> (value #>> '{}')
    FROM jsonb_array_elements(coalesce(p_merged_digest->'new_reference_keys', '[]'::jsonb))
  ) refs
  WHERE refs.ref_id IS NOT NULL;

  -- 병합된 새 Digest 생성 (추출 대기 — 2단계가 새 진술을 뽑는다)
  v_new_digest := gen_random_uuid();
  INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name, extraction_status)
  VALUES (
    v_new_digest, v_source_id, v_space_id,
    p_merged_digest->>'title', p_merged_digest->>'description', p_merged_digest->'body',
    CASE WHEN jsonb_array_length(coalesce(p_merged_digest->'external_urls', '[]'::jsonb)) > 0
      THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(p_merged_digest->'external_urls'))
    END,
    v_author_id, v_author_name, 'pending'
  );

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (p_changeset_id, 'create', 'digest', v_new_digest,
    (p_merged_digest - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids));

  FOR v_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_merged_digest->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(v_name) = '';
    INSERT INTO topics (space_id, title)
    VALUES (v_space_id, btrim(v_name))
    ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_topic_id;
    INSERT INTO digest_topics (digest_id, topic_id)
    VALUES (v_new_digest, v_topic_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_tag IN SELECT value FROM jsonb_array_elements(coalesce(p_merged_digest->'tags', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
    INSERT INTO tags (workspace_id, title, description)
    VALUES (v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''))
    ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_tag_id;
    INSERT INTO digest_tags (digest_id, tag_id)
    VALUES (v_new_digest, v_tag_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(v_ref_ids)
  LOOP
    INSERT INTO digest_references (digest_id, reference_id)
    VALUES (v_new_digest, v_ref::uuid) ON CONFLICT DO NOTHING;
  END LOOP;

  -- 옛 Digest 둘 다 archive — duplicates 병합은 conflicts(진술 하나 replaces)와 달리
  -- Digest 단위다("Digest 둘 archive + 하나 create", surface-inventory.md 모델 절).
  UPDATE digests SET status = 'archived' WHERE id IN (v_digest_a, v_digest_b);
  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'digest', v_digest_a);
  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'digest', v_digest_b);

  -- 두 옛 Digest의 active 진술 전부 archive(confirm_digest_edit과 같은 패턴 — 관계는
  -- 캐스케이드 트리거가 처리) + 각 진술을 끝점으로 삼던 다른 대기 제안 무효화(캐스케이드,
  -- 07-modeling.md "한 Digest가 여러 곳과 동시에 중복될 수 있다").
  FOR v_stmt IN
    SELECT id FROM statements WHERE digest_id IN (v_digest_a, v_digest_b) AND status = 'active'
  LOOP
    UPDATE statements SET status = 'archived', ingestion_status = 'pending' WHERE id = v_stmt;
    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (p_changeset_id, 'archive', 'statement', v_stmt);
    PERFORM invalidate_stale_relation_proposals(v_stmt, p_changeset_id);
  END LOOP;

  -- 재트리거: 새 Digest가 속한 source만 추출·재연결 대기로(confirm_digest_edit과 동일).
  --
  -- 알려진 갭: 이 시점에 v_new_digest는 extraction_status='pending'이라 진술이 아직
  -- 없다. 비동기 추출(apply_extraction_statements)이 끝나기 전에 이 changeset을
  -- revert하면, revert_changeset은 지금 이 changes 행들(digest create/archive 등)만
  -- 역연산하므로 새 Digest는 archive되지만, *나중에* 도착하는 추출 결과가 그 archived
  -- Digest 밑에 active 진술을 만들어 붙인다(진술 생성이 digest 상태를 안 본다) —
  -- confirm_digest_edit(manual 수정)도 같은 2단계·revert 경쟁을 그대로 가진 기존
  -- 구조적 갭이라 이번 스코프에서 새로 고치지 않는다.
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;

  -- title: 병합 확정 시점의 실제 결과 제목으로 갱신 — 제안 생성 단계의 "A vs B" 임시값을
  -- 대체한다(review-flow.md "Changeset 제목 자동 생성 (relation - 중복)").
  UPDATE changesets SET status = 'closed', outcome = 'applied', title = p_merged_digest->>'title'
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- archive_statement -----
CREATE OR REPLACE FUNCTION archive_statement(p_statement_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_author_id    uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE statements
  SET status = 'archived', ingestion_status = 'pending'
  WHERE id = p_statement_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement % is not an active statement the caller can archive', p_statement_id;
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (space_id, type, status, outcome, author_id, author_name)
  VALUES (v_space_id, 'manual', 'closed', 'applied', v_author_id, resolve_user_display_name(v_author_id))
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'statement', p_statement_id);

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- archive_digest -----
CREATE OR REPLACE FUNCTION archive_digest(p_digest_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_changeset_id  uuid;
  v_author_id     uuid;
  v_stmt          uuid;
  v_touched_stmt  boolean := false;
BEGIN
  UPDATE digests
  SET status = 'archived'
  WHERE id = p_digest_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'digest % is not an active digest the caller can archive', p_digest_id
      USING ERRCODE = 'NM010';
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (space_id, type, status, outcome, author_id, author_name)
  VALUES (v_space_id, 'manual', 'closed', 'applied', v_author_id, resolve_user_display_name(v_author_id))
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'digest', p_digest_id);

  -- confirm_digest_edit과 같은 연쇄 archive 관용구 — 진술은 ingestion_status를
  -- pending으로 되돌려 임베딩 워커가 벡터를 지우게 한다. 관계는 트리거가 처리.
  FOR v_stmt IN SELECT id FROM statements WHERE digest_id = p_digest_id AND status = 'active'
  LOOP
    UPDATE statements SET status = 'archived', ingestion_status = 'pending' WHERE id = v_stmt;
    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_changeset_id, 'archive', 'statement', v_stmt);
    v_touched_stmt := true;
  END LOOP;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- update_reference -----
CREATE OR REPLACE FUNCTION update_reference(
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
  v_author_id    uuid;
  v_changeset_id uuid;
BEGIN
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
    RAISE EXCEPTION 'reference % is not an active reference the caller can edit', p_reference_id
      USING ERRCODE = 'NM007';
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
    RAISE EXCEPTION 'reference % unchanged — nothing to modify', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (space_id, type, status, outcome, author_id, author_name)
  VALUES (NULL, 'manual', 'closed', 'applied', v_author_id, resolve_user_display_name(v_author_id))
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

-- ----- archive_reference -----
CREATE OR REPLACE FUNCTION archive_reference(p_reference_id uuid)
RETURNS uuid AS $$
DECLARE
  v_workspace_id uuid;
  v_author_id    uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE "references"
  SET status = 'archived'
  WHERE id = p_reference_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  RETURNING workspace_id INTO v_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can archive', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (space_id, type, status, outcome, author_id, author_name)
  VALUES (NULL, 'manual', 'closed', 'applied', v_author_id, resolve_user_display_name(v_author_id))
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'reference', p_reference_id);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- revert_changeset -----
CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_source_id     uuid;
  v_orig_title    text;
  v_orig_depth    integer;
  v_author_id     uuid;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
BEGIN
  SELECT space_id, type, source_id, title, revert_depth
    INTO v_space_id, v_type, v_source_id, v_orig_title, v_orig_depth
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
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (space_id, type, status, outcome, reverts_id, author_id, author_name, title, revert_depth)
  VALUES (
    v_space_id, 'revert', 'closed', 'applied', p_changeset_id, v_author_id, resolve_user_display_name(v_author_id),
    v_orig_title, v_orig_depth + 1
  )
  RETURNING id INTO v_revert_id;

  -- ingestion 예외: changes 밖의 원문(source_id)도 pending으로 되돌린다
  -- ("글 통째로" — v2에선 archive가 아니라 pending 복귀, 07-modeling.md)
  IF v_type = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'pending'
    WHERE id = v_source_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_revert_id, 'archive', 'source', v_source_id);
      v_did_anything := true;
    END IF;
  END IF;

  -- 타겟 changes의 역연산. 일반 규칙 하나로 모든 타입을 닫는다.
  FOR v_ch IN
    SELECT action, target_type, target_id FROM changes WHERE changeset_id = p_changeset_id
  LOOP
    IF v_ch.action IN ('create', 'restore') THEN
      v_inverse := 'archive';
    ELSIF v_ch.action = 'archive' THEN
      v_inverse := 'restore';
    ELSE
      CONTINUE;  -- modify는 reference 전용이고 되돌리기 미지원(§10 오픈)
    END IF;

    -- Reference의 create→archive 방향은 건너뛴다(공유 자원 보호).
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
      ELSIF v_ch.target_type = 'source' THEN  -- v2에서 "빼기"의 도착지는 pending
        UPDATE sources SET status = 'pending'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSE
        CONTINUE;  -- reference는 위에서 이미 걸러짐; 알 수 없는 타입 방어
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
      ELSE  -- source: pending에서만 복귀 (trashed는 복원 RPC의 몫)
        UPDATE sources SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'pending';
        IF NOT FOUND THEN CONTINUE; END IF;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

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
