-- =============================================================
-- Digest 직접 수정 (O) — 확정된 Digest를 manual changeset으로 고친다
--
-- 07-modeling: 확정(active) Digest는 불변이라, 수정은 옛 Digest를 archive하고 고친
-- 내용으로 새 Digest를 만드는 manual changeset으로 표현한다. 새 Digest는 같은
-- sourceId를 유지한다. 확정 시 옛 Digest archive + 옛 진술 archive(관계는 캐스케이드
-- 트리거가 처리) + 새 Digest create가 한 changeset에 담기고, 새 Digest는 다시 추출을
-- 타 진술을 낳는다.
--
-- 1) chk_changeset_shape 완화 — manual이 source_id를 가질 수 있게(Digest 수정은
--    원본에 매인다). Reference 수정 manual은 여전히 source_id 없이 허용. revert는 그대로.
-- 2) digests.extraction_status — 어느 Digest가 추출 대기/완료인지 per-digest 게이트.
--    source 단위 클레임/lease는 그대로(잇기 무영향), 이 컬럼은 "어느 digest를 뽑을지"만 가른다.
-- 3) apply_extraction_statements 재작성 — 진술을 "그 digest를 만든 changeset"에 붙이고
--    (ingestion 하드코딩 제거 — manual 수정본의 진술은 그 manual changeset에 붙어야 한다),
--    처리한 digest(진술 0개짜리 포함)를 completed로 표시. complete_source_extraction 흡수.
-- 4) confirm_digest_edit — 위 흐름을 한 트랜잭션으로.
-- =============================================================

-- =============================================================
-- 1) chk_changeset_shape — manual의 source_id 허용 (Y)
-- =============================================================

ALTER TABLE changesets DROP CONSTRAINT chk_changeset_shape;
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_shape CHECK (
  (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
  (type = 'relation'  AND source_id IS NOT NULL AND reverts_id IS NULL AND author_id IS NULL) OR
  (type = 'revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
  -- manual: Digest 수정은 source_id 유지, Reference 수정은 source_id 없음 — 둘 다 허용.
  -- 수동 수정이라는 출처는 sourceId가 아니라 type='manual'이 구분한다(07-modeling).
  (type = 'manual'    AND reverts_id IS NULL)
);

-- =============================================================
-- 2) digests.extraction_status (P)
-- =============================================================

ALTER TABLE digests
  ADD COLUMN extraction_status ingestion_status NOT NULL DEFAULT 'pending';

-- 백필: 진술이 하나라도 달린 digest는 이미 추출됨 → completed. 그 외(방금 확정돼 추출
-- 대기 중이거나 진술 0개)는 pending으로 남아 다음 사이클에 (재)집힌다 — J 직후 추출
-- 대기 중이던 digest를 놓치지 않게. 0개짜리는 재추출돼도 무해하고 곧 completed로 고정된다.
UPDATE digests d SET extraction_status = 'completed'
WHERE EXISTS (SELECT 1 FROM statements s WHERE s.digest_id = d.id);

-- 추출 워커의 digest 게이트 인덱스 (source의 pending digest 조회)
CREATE INDEX idx_digests_extraction_pending ON digests (source_id)
  WHERE extraction_status = 'pending';

-- =============================================================
-- 3) apply_extraction_statements — 진술을 각 digest의 changeset에 붙인다
--
-- p_digest_ids: 이번에 추출을 시도한(진술 0개 포함) digest들 — completed로 표시.
-- p_statements 원소: { content, type, confidence|null, digest_id, index, due_date|null }
--   진술은 그 digest를 만든 changeset(ingestion이든 manual이든)에 create change로 붙는다.
-- =============================================================

DROP FUNCTION IF EXISTS apply_extraction_statements(uuid, jsonb);

CREATE FUNCTION apply_extraction_statements(
  p_source_id  uuid,
  p_digest_ids uuid[],
  p_statements jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_statement_id uuid;
  v_item         jsonb;
BEGIN
  IF jsonb_typeof(p_statements) != 'array' THEN
    RAISE EXCEPTION 'p_statements must be a JSON array';
  END IF;

  -- 완료 표시 = pending 클레임(source 단위). 이미 completed/failed면 멈춰 늦게 도착한
  -- 적용이 진술을 중복 생성하지 못하게 한다.
  UPDATE sources
  SET extraction_status = 'completed', error_message = NULL
  WHERE id = p_source_id AND extraction_status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending extraction', p_source_id;
  END IF;

  -- 처리한 digest를 완료 표시 — 진술 0개짜리도 여기서 닫아 재추출 루프를 막는다.
  UPDATE digests SET extraction_status = 'completed'
  WHERE id = ANY(p_digest_ids) AND extraction_status = 'pending';

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_statements)
  LOOP
    IF v_item->>'index' IS NULL THEN
      RAISE EXCEPTION 'each statement requires an index (source order)';
    END IF;
    IF v_item->>'digest_id' IS NULL THEN
      RAISE EXCEPTION 'each statement requires a digest_id (extraction origin)';
    END IF;

    -- 진술이 붙을 곳 = 그 digest를 만든 changeset. ingestion Digest면 ingestion
    -- changeset, manual 수정 Digest면 그 manual changeset — 되돌리기·purge가 진술을
    -- 자기 인제스천/수정과 함께 되돌리게 한다(07-modeling: 2단계는 같은 changeset의 연속).
    SELECT ch.changeset_id INTO v_changeset_id
    FROM changes ch
    WHERE ch.target_type = 'digest' AND ch.action = 'create'
      AND ch.target_id = (v_item->>'digest_id')::uuid
    LIMIT 1;

    IF v_changeset_id IS NULL THEN
      RAISE EXCEPTION 'no creating changeset for digest %', v_item->>'digest_id';
    END IF;

    INSERT INTO statements (space_id, content, type, confidence, due_date, digest_id)
    VALUES (
      v_space_id,
      v_item->>'content',
      (v_item->>'type')::statement_type,
      (v_item->>'confidence')::statement_confidence,
      (v_item->>'due_date')::date,
      (v_item->>'digest_id')::uuid
    )
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_sources (statement_id, source_id, locator)
    VALUES (
      v_statement_id,
      p_source_id,
      jsonb_build_object('index', (v_item->>'index')::int)
    );

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'statement', v_statement_id, v_item - 'index');
  END LOOP;

  -- 임베딩 안전망 (적용 직후 워커가 죽어도 재기동 후 pending 진술을 깨운다)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION apply_extraction_statements(uuid, uuid[], jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_extraction_statements(uuid, uuid[], jsonb) TO service_role;

-- complete_source_extraction은 apply_extraction_statements(빈 p_statements)로 흡수됐다.
DROP FUNCTION IF EXISTS complete_source_extraction(uuid);

-- =============================================================
-- 4) confirm_digest_edit — 확정 Digest를 manual changeset으로 수정
--
-- p_digest 원소: { title, description, body, topics[], tags[{title,description}],
--                  reference_ids[uuid], new_reference_keys[text], external_urls[text] }
-- p_new_references 원소: { key, type, title, body }
-- 한 트랜잭션: manual changeset 생성 → 신규 Reference·새 Digest create(+라벨·인용) →
--   옛 Digest archive → 옛 진술 archive(관계는 트리거 캐스케이드) → 원본 재추출·재연결 트리거.
-- =============================================================

CREATE FUNCTION confirm_digest_edit(
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

  -- 확정본 수정이라 원본이 active여야 한다(pending/trashed 원본의 digest는 수정 대상 아님).
  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'active') THEN
    RAISE EXCEPTION 'source % of digest % is not active', v_source_id, p_digest_id;
  END IF;

  v_author_id := auth.uid();

  -- manual changeset — source_id 유지(Y). 사람 주도라 author_id 채움.
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'manual', 'applied', v_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  -- 신규 Reference 생성 + key→예약 id 매핑
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO "references" (id, workspace_id, type, title, body)
    VALUES (v_ref_id, v_workspace_id, (v_item->>'type')::reference_type, v_item->>'title', v_item->>'body');
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (v_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object('type', v_item->>'type', 'title', v_item->>'title', 'body', v_item->>'body'));
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
  -- linking도 pending으로 되돌린다(잇기 배치는 원본 단위라 전체 재판정 — 멱등·재제안 가드가 받는다).
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- 사용자 경로: RPC 안에서 멤버십 검증. service_role(운영)도 허용.
REVOKE ALL ON FUNCTION confirm_digest_edit(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION confirm_digest_edit(uuid, jsonb, jsonb) TO authenticated, service_role;
