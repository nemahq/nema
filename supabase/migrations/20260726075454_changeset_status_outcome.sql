-- =============================================================
-- Changeset 상태 축 정리 — status(open/closed) + outcome(applied/discarded)
--
-- 07-modeling.md "Changeset"이 규정하는 두 필드 모델을 실제 스키마로 옮긴다.
-- 지금까지는 changeset_status 한 필드가 "끝났나"와 "어떻게 끝났나" 두 질문을
-- 겸했다(pending/applied/rejected, 20260611091637 + 20260615115643). 값이
-- 늘 때마다 두 축이 곱해져 조합이 불어나고(예: ingestion 버리기가 relation의
-- rejected를 "뜻이 다르지만 모양이 같아서" 빌려 쓴 20260714130000), 소비처는
-- 매번 type+status를 함께 봐야 의미가 정해졌다. 축을 나누면 "열려 있나"만
-- 묻는 곳(목록 Open/Closed 탭·재제안 가드·초안 액션 잠금)은 status만 보면
-- 되고, 결과가 필요한 곳만 outcome을 본다.
--
-- 매핑:
--   pending  → status='open',   outcome=NULL
--   applied  → status='closed', outcome='applied'
--   rejected → status='closed', outcome='discarded'
--
-- 과도기를 남기지 않는다 — 옛 enum·컬럼은 이 마이그레이션 안에서 완전히 지운다.
-- 컬럼명 status가 이미 점유돼 있어 순서가 중요하다: 옛 컬럼을 legacy_status로
-- 밀어낸 뒤 새 컬럼 둘을 만들고, 백필하고, 옛 컬럼·타입을 드롭한다.
-- =============================================================

-- ----- 1) 타입·컬럼 자리 만들기 -----

-- 옛 enum은 이름만 비켜준다(값 목록이 완전히 달라 ALTER TYPE ... RENAME VALUE로는
-- 못 옮긴다). 새 타입을 같은 이름으로 만들어야 이 타입을 선언에 쓰는 RPC들이
-- 아래 재정의에서 그대로 changeset_status를 쓸 수 있다.
ALTER TYPE changeset_status RENAME TO changeset_status_legacy;

CREATE TYPE changeset_status  AS ENUM ('open', 'closed');
CREATE TYPE changeset_outcome AS ENUM ('applied', 'discarded');

ALTER TABLE changesets RENAME COLUMN status TO legacy_status;

ALTER TABLE changesets
  ADD COLUMN status  changeset_status,
  ADD COLUMN outcome changeset_outcome;

-- ----- 2) 백필 -----

-- trg_changesets_updated_at은 컬럼 무관 모든 UPDATE에 반응하므로, 끄지 않으면
-- 이 한 문장이 모든 changeset의 updated_at("판단이 내려진 시각", 상세 헤더가
-- 그대로 노출한다)을 배포 시각으로 덮어쓴다 — 20260718090000이 정확히 이걸로
-- 오염을 냈고 20260718100000이 보정해야 했던 실수라 같은 방식으로 막는다.
ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

UPDATE changesets
SET status = CASE legacy_status
      WHEN 'pending' THEN 'open'
      ELSE 'closed'
    END::changeset_status,
    outcome = CASE legacy_status
      WHEN 'applied'  THEN 'applied'
      WHEN 'rejected' THEN 'discarded'
    END::changeset_outcome;

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;

-- ----- 3) 불변식 고정 + 옛 축 제거 -----

ALTER TABLE changesets ALTER COLUMN status SET NOT NULL;

-- 두 필드가 어긋나는 조합(열려 있는데 결과가 있다 / 닫혔는데 결과가 없다)을
-- DB가 막는다. 한 필드를 쪼갠 대가로 생기는 유일한 위험이 정확히 이 어긋남이라,
-- 축을 나누면서 같이 심어야 나눈 값이 유지된다.
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_outcome CHECK (
  (status = 'open'   AND outcome IS NULL) OR
  (status = 'closed' AND outcome IS NOT NULL)
);

-- 컬럼을 지우면 이 컬럼을 포함한 인덱스도 함께 사라진다(20260720120000의
-- source.listPending 인덱스) — 새 status로 같은 모양을 다시 만든다.
ALTER TABLE changesets DROP COLUMN legacy_status;
DROP TYPE changeset_status_legacy;

CREATE INDEX idx_changesets_source_type_status
  ON changesets (source_id, type, status)
  WHERE source_id IS NOT NULL;

-- =============================================================
-- 4) RPC 재정의 — status 읽기·쓰기를 두 필드 기준으로
--
--   본문은 각 함수의 직전 정의를 그대로 옮기고 상태 처리만 바꿨다. 위에서
--   changeset_status를 같은 이름의 새 타입으로 바꿔치웠으므로, v_status를
--   선언하는 함수를 재정의하지 않으면 "죽은 분기"로 조용히 남는 게 아니라
--   호출 시점에 깨진다 — plpgsql은 함수 본문을 첫 호출(세션당)에 재파싱하므로,
--   `v_status <> 'pending'` 비교가 'pending'을 새 changeset_status로 캐스팅을
--   시도해 `invalid input value for enum`으로 즉시 터진다. 그래서 "읽기만 하는"
--   가드까지 빠짐없이 여기 포함한다(트리거 disable 관용구는 20260721110000
--   revert_changeset_depth 참고 — 같은 오염을 이번 백필에도 그대로 적용).
-- =============================================================
-- ----- create_ingestion_review -----
CREATE OR REPLACE FUNCTION create_ingestion_review(
  p_source_id         uuid,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_title text;
  v_changeset_id uuid;
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

  -- author_id는 안 채운다 — ingestion은 엔진 산물이라 항상 null(07-modeling authorId
  -- 규칙, 20260717140000이 Source 제출자 id를 잘못 채우던 버그를 고쳤다).
  INSERT INTO changesets (space_id, type, status, source_id, title)
  VALUES (v_space_id, 'ingestion', 'open', p_source_id, v_source_title)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- update_pending_ingestion -----
CREATE OR REPLACE FUNCTION update_pending_ingestion(
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
  IF v_type <> 'ingestion' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review', p_changeset_id;
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

-- ----- confirm_ingestion_review -----
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
  IF v_type <> 'ingestion' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review', p_changeset_id;
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

  UPDATE changesets SET status = 'closed', outcome = 'applied' WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- discard_ingestion_review -----
CREATE OR REPLACE FUNCTION discard_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id  uuid;
  v_source_id uuid;
  v_status    changeset_status;
  v_type      changeset_type;
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
    RAISE EXCEPTION 'changeset % is not an open ingestion review the caller can discard', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE sources SET status = 'pending'
  WHERE id = v_source_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending — cannot discard a review whose source drifted', v_source_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE changesets SET status = 'closed', outcome = 'discarded' WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- restore_ingestion_review -----
CREATE OR REPLACE FUNCTION restore_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id  uuid;
  v_source_id uuid;
  v_status    changeset_status;
  v_outcome   changeset_outcome;
  v_type      changeset_type;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.outcome, c.type
    INTO v_space_id, v_source_id, v_status, v_outcome, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'closed' OR v_outcome IS DISTINCT FROM 'discarded' THEN
    RAISE EXCEPTION 'changeset % is not a discarded ingestion review the caller can restore', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'pending') THEN
    RAISE EXCEPTION 'source % is not pending — cannot restore a review over a trashed source', v_source_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE changesets SET status = 'open', outcome = NULL WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  -- title = 새 Digest의 제목(수정 결과를 대표).
  INSERT INTO changesets (space_id, type, status, outcome, source_id, author_id, title)
  VALUES (v_space_id, 'manual', 'closed', 'applied', v_source_id, v_author_id, p_digest->>'title')
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
  -- linking도 pending으로 되돌린다(잇기 배치는 원문 단위라 전체 재판정).
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- propagate_source_title_to_changeset -----
CREATE OR REPLACE FUNCTION propagate_source_title_to_changeset()
RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE changesets
    SET title = NEW.title
    WHERE source_id = NEW.id AND type = 'ingestion' AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

  INSERT INTO changesets (space_id, type, status, outcome, author_id)
  VALUES (NULL, 'manual', 'closed', 'applied', auth.uid())
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

  INSERT INTO changesets (space_id, type, status, outcome, author_id)
  VALUES (NULL, 'manual', 'closed', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'reference', p_reference_id);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- archive_statement -----
CREATE OR REPLACE FUNCTION archive_statement(p_statement_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
BEGIN
  -- 빼기 = active→archived 전이. 클레임과 동시에 소유 검증을 한 UPDATE로.
  UPDATE statements
  SET status = 'archived', ingestion_status = 'pending'
  WHERE id = p_statement_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    -- active가 아니거나(이미 빠짐) 멤버가 아니거나 없는 진술
    RAISE EXCEPTION 'statement % is not an active statement the caller can archive', p_statement_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, outcome, author_id)
  VALUES (v_space_id, 'manual', 'closed', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'statement', p_statement_id);

  -- 워커가 archived 진술의 벡터를 지운다(선언적 동기화, schema §5.3)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- archive_digest -----
CREATE OR REPLACE FUNCTION archive_digest(p_digest_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_changeset_id  uuid;
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

  INSERT INTO changesets (space_id, type, status, outcome, author_id)
  VALUES (v_space_id, 'manual', 'closed', 'applied', auth.uid())
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

-- ----- revert_changeset -----
CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_source_id     uuid;
  v_orig_title    text;
  v_orig_depth    integer;
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

  INSERT INTO changesets (space_id, type, status, outcome, reverts_id, author_id, title, revert_depth)
  VALUES (
    v_space_id, 'revert', 'closed', 'applied', p_changeset_id, auth.uid(),
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

-- ----- invalidate_stale_relation_proposals -----
CREATE OR REPLACE FUNCTION invalidate_stale_relation_proposals(
  p_statement_id   uuid,
  p_invalidated_by uuid
)
RETURNS void AS $$
BEGIN
  UPDATE changesets c
  SET status = 'closed',
      outcome = 'discarded',
      invalidated_by_id = p_invalidated_by
  WHERE c.type = 'relation'
    AND c.status = 'open'
    AND c.id <> p_invalidated_by
    AND EXISTS (
      SELECT 1 FROM changes ch
      WHERE ch.changeset_id = c.id
        AND ch.target_type = 'relation'
        AND (ch.data->>'from_id' = p_statement_id::text
          OR ch.data->>'to_id' = p_statement_id::text)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- resolve_conflict_relation -----
CREATE OR REPLACE FUNCTION resolve_conflict_relation(
  p_changeset_id        uuid,
  p_winner_statement_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_rel_type     text;
  v_from_id      uuid;
  v_to_id        uuid;
  v_loser_id     uuid;
  v_relation_id  uuid;
  v_existing     record;
BEGIN
  SELECT space_id, status, type INTO v_space_id, v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'relation' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open relation proposal', p_changeset_id;
  END IF;

  SELECT data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open relation changeset % has no relation change', p_changeset_id;
  END IF;
  IF v_rel_type <> 'conflicts' THEN
    RAISE EXCEPTION 'changeset % is not a conflicts proposal (use resolve_duplicate_relation)', p_changeset_id;
  END IF;

  IF p_winner_statement_id = v_from_id THEN
    v_loser_id := v_to_id;
  ELSIF p_winner_statement_id = v_to_id THEN
    v_loser_id := v_from_id;
  ELSE
    RAISE EXCEPTION 'winner % is not an endpoint of changeset %', p_winner_statement_id, p_changeset_id;
  END IF;

  -- 끝점 무결성: 대기 중 끝점이 archived됐으면(다른 경로로 이미 처리됨) 판정 불가.
  IF NOT EXISTS (SELECT 1 FROM statements WHERE id = v_from_id AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM statements WHERE id = v_to_id AND status = 'active') THEN
    RAISE EXCEPTION 'endpoint no longer active for relation proposal %', p_changeset_id;
  END IF;

  -- 승자→패자 replaces 관계. (from,to,type)는 상태 무관 유니크라 기존 행을 먼저
  -- 본다 — 단순 INSERT ON CONFLICT DO NOTHING은 archived 행과도 충돌해 "적용했는데
  -- active가 안 생기는" 조용한 no-op이 된다(옛 apply_pending_relation이 §5.1 A로
  -- 경고하던 바로 그 함정 — 충돌 판정→되돌리기→재제안→재판정 시 이 경로를 탄다).
  SELECT id, status INTO v_existing
  FROM statement_relations
  WHERE from_id = p_winner_statement_id AND to_id = v_loser_id AND type = 'replaces';

  IF NOT FOUND THEN
    -- 없음 → 새로 생성. change는 {create, 새 id}.
    INSERT INTO statement_relations (space_id, type, from_id, to_id)
    VALUES (v_space_id, 'replaces', p_winner_statement_id, v_loser_id)
    RETURNING id INTO v_relation_id;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'relation', v_relation_id,
      jsonb_build_object(
        'type', 'replaces', 'from_id', p_winner_statement_id, 'to_id', v_loser_id
      )
    );
  ELSIF v_existing.status = 'archived' THEN
    -- 가려져 있던 같은 replaces → 되살림. change는 {restore, 기존 id}(data 없음 —
    -- archive·restore는 target_id로 충분, 07-modeling.md Change.data 정의).
    UPDATE statement_relations SET status = 'active' WHERE id = v_existing.id;
    v_relation_id := v_existing.id;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (p_changeset_id, 'restore', 'relation', v_relation_id);
  ELSE
    -- 이미 active(드문 중복 판정) → 전이 없음. change row도 안 남긴다(§4.4 "실제
    -- 전이만 기록").
    v_relation_id := v_existing.id;
  END IF;

  -- 패자 archive + 벡터 축출 예약(ingestion_status='pending'). 걸린 다른 관계는
  -- 캐스케이드 트리거가 처리(duplicates 제외).
  UPDATE statements
  SET status = 'archived', ingestion_status = 'pending'
  WHERE id = v_loser_id AND status = 'active';

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'statement', v_loser_id);

  -- 패자를 끝점으로 삼던 다른 대기 제안은 대상 소실로 무효화.
  PERFORM invalidate_stale_relation_proposals(v_loser_id, p_changeset_id);

  UPDATE changesets SET status = 'closed', outcome = 'applied' WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_relation_id;
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
    RAISE EXCEPTION 'changeset % is not an open relation proposal', p_changeset_id;
  END IF;

  SELECT data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open relation changeset % has no relation change', p_changeset_id;
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
  INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, extraction_status)
  VALUES (
    v_new_digest, v_source_id, v_space_id,
    p_merged_digest->>'title', p_merged_digest->>'description', p_merged_digest->'body',
    CASE WHEN jsonb_array_length(coalesce(p_merged_digest->'external_urls', '[]'::jsonb)) > 0
      THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(p_merged_digest->'external_urls'))
    END,
    v_author_id, 'pending'
  );

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (p_changeset_id, 'create', 'digest', v_new_digest,
    (p_merged_digest - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids));

  FOR v_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_merged_digest->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(v_name) = '';
    INSERT INTO topics (space_id, name)
    VALUES (v_space_id, btrim(v_name))
    ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
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

-- ----- apply_relation_changesets -----
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
  v_from_title   text;
  v_to_title     text;
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

  -- ----- 사람 판정분: 건당 변경셋 1개. title = 끝점 Digest "A vs B" -----
  -- 애매·모순(conflicts)·같음(duplicates) 모두 여기로 흘러 사람 검토를 거친다.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pending)
  LOOP
    -- 재시도가 같은 쌍을 다시 제안하면 아직 열려 있는 변경셋을 건너뛴다. 사람이
    -- 실제로 거절한(invalidated_by_id가 NULL인) discarded 쌍도 다시 안 올린다 —
    -- 캐스케이드로 무효화된(invalidated_by_id가 있는) discarded는 막지 않는다.
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
        AND ch.data->>'from_id' = v_item->>'from_id'
        AND ch.data->>'to_id'   = v_item->>'to_id'
        AND ch.data->>'type'    = v_item->>'type'
    );

    SELECT d.title INTO v_from_title
    FROM statements s JOIN digests d ON d.id = s.digest_id
    WHERE s.id = (v_item->>'from_id')::uuid;

    SELECT d.title INTO v_to_title
    FROM statements s JOIN digests d ON d.id = s.digest_id
    WHERE s.id = (v_item->>'to_id')::uuid;

    INSERT INTO changesets (space_id, type, status, source_id, title)
    VALUES (
      v_space_id, 'relation', 'open', p_source_id,
      CASE WHEN v_from_title IS NOT NULL AND v_to_title IS NOT NULL
        THEN v_from_title || ' vs ' || v_to_title
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

-- ----- reject_pending_relation -----
CREATE OR REPLACE FUNCTION reject_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE changesets
  SET status = 'closed', outcome = 'discarded'
  WHERE id = p_changeset_id
    AND type = 'relation' AND status = 'open'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % is not an open relation proposal the caller can reject', p_changeset_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- reassign_source_space -----
CREATE OR REPLACE FUNCTION reassign_source_space(p_source_id uuid, p_space_id uuid)
RETURNS void AS $$
BEGIN
  -- 대상 Space 접근권은 아래 상태 가드(NM004, "그 사이 상태가 바뀜")와 다른 종류의
  -- 거부라 별도 코드로 던진다. 같은 코드로 뭉치면 실제로는 접근권이 없는 시도인데도
  -- "초안 상태가 바뀌었으니 새로고침하라"는 엉뚱한 안내가 뜬다. 42501은 다른 RPC의
  -- insufficient_privilege 그대로라 error-mapper가 이미 "forbidden"으로 매핑한다.
  IF auth.uid() IS NOT NULL AND NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id
      USING ERRCODE = '42501';
  END IF;

  -- 확정 대기 중인 리뷰가 있으면 막는다(start_source_digestion과 같은 이유) —
  -- changesets.space_id는 옛 Space에 그대로 남으므로, Source만 옮기면 그 changeset이
  -- 나중에 확정될 때 멤버십 판정과 결과 Digest 생성이 옛 Space 기준으로 어긋난다.
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id
      AND c.type = 'ingestion'
      AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE sources
  SET space_id = p_space_id
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle pending source the caller can reassign', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- pending_draft_source_ids -----
CREATE OR REPLACE FUNCTION pending_draft_source_ids(p_space_id uuid)
RETURNS SETOF uuid AS $$
  SELECT id FROM sources
  WHERE space_id = p_space_id
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM changesets
      WHERE changesets.source_id = sources.id
        AND changesets.type = 'ingestion'
        AND changesets.status = 'open'
    );
$$ LANGUAGE sql STABLE;

-- ----- start_source_digestion -----
CREATE OR REPLACE FUNCTION start_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id AND c.type = 'ingestion' AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE sources
  SET digestion_status       = 'pending',
      last_digestion_attempt = NULL,
      digestion_started_at   = now(),
      error_message          = NULL
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status IN ('completed', 'failed', 'cancelled')
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can digest', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE source_digestion_state
  SET digestion_retry_count = 0
  WHERE source_id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_digestion_state row missing for source %', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- update_source_body -----
CREATE OR REPLACE FUNCTION update_source_body(p_source_id uuid, p_body text)
RETURNS void AS $$
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'p_body must be a non-empty text';
  END IF;

  UPDATE sources
  SET body = btrim(p_body)
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM changesets
      WHERE source_id = p_source_id
        AND type = 'ingestion'
        AND status = 'open'
    )
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can rewrite', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
