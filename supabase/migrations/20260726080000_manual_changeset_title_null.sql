-- =============================================================
-- manual changeset.title — 항상 null로 (review-flow.md "Changeset 제목
-- 미생성 (manual)")
--
-- manual changeset은 변경셋 목록·Changeset 상세 어디에도 뜨지 않고, 오직
-- 대상(Digest·Reference)의 "변경 이력" 모달(list_manual_changes_for_target)
-- 에서만 조회되는데 그 모달의 행 라벨은 제목이 아니라 수정 시각+수정한
-- 사람이라 changeset 제목 자체가 읽힐 자리가 없다 — title을 채우는 건 아무
-- 데도 안 쓰이는 불필요한 작업이다.
--
-- update_reference·archive_reference는 20260721090000(NM007 errcode 부여
-- 리팩터)에서 title 인자를 이미 뺐다 — 새 CREATE OR REPLACE가 이전 정의를
-- 덮으며 의도치 않게 함께 고쳐졌다. 남은 건 confirm_digest_edit(Digest
-- manual 수정) 하나뿐 — archive_digest(20260721110001)는 신설 당시부터 이미
-- title을 안 채웠다(그 파일 주석이 이 버그를 이미 인지하고 새 함수까지
-- 따라가지 않게 명시).
-- =============================================================

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

  -- manual changeset — source_id 유지(Y). 사람 주도라 author_id 채움.
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'manual', 'applied', v_source_id, v_author_id)
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
  INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, extraction_status)
  VALUES (
    v_new_digest, v_source_id, v_space_id,
    p_digest->>'title', p_digest->>'description', p_digest->'body',
    CASE WHEN jsonb_array_length(coalesce(p_digest->'external_urls', '[]'::jsonb)) > 0
      THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(p_digest->'external_urls'))
    END,
    v_author_id, 'pending'
  );

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (v_changeset_id, 'create', 'digest', v_new_digest,
    (p_digest - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids));

  -- 주제 find-or-create + 연결 (confirm_ingestion_review와 같은 관용구)
  FOR v_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_digest->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(v_name) = '';
    INSERT INTO topics (space_id, name)
    VALUES (v_space_id, btrim(v_name))
    ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
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
  -- linking도 pending으로 되돌린다(잇기 배치는 원문 단위라 전체 재판정 — 멱등·재제안 가드가 받는다).
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 백필 — 기존 manual changeset의 title을 전부 null로
--
-- confirm_digest_edit(위)·update_reference·archive_reference(둘 다
-- 20260721090000에서 이미 title 안 채우게 바뀜)가 그동안 채워온 값을 지운다.
-- trg_changesets_updated_at은 컬럼 무관 모든 UPDATE에 반응하므로, 다른
-- 백필들과 같은 이유로 이 구간만 꺼서 이미 closed된 changeset의 updated_at이
-- 배포 시각으로 리셋되지 않게 한다.
-- =============================================================

ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

UPDATE changesets SET title = NULL WHERE type = 'manual' AND title IS NOT NULL;

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;
