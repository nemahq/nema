-- =============================================================
-- Digest 리뷰 초안 기반 안정화 — 안정 id·명시적 순서·원본 스냅샷·버전 가드
--
-- 지금까지 update_pending_ingestion은 저장할 때마다 changes를 DELETE 후
-- write_ingestion_review_changes로 전량 재삽입했다. INSERT마다 gen_random_uuid()로
-- target_id를 새로 뽑고 순서도 행 삽입 순서(사실상 랜덤)로 결정돼, 프론트가
-- 배열 인덱스로 후보를 식별하고 저장 성공 시 편집 상태를 통째로 버리는 것으로
-- 이를 회피해왔다(getReview 주석 참고). 이 상태로는 자동 저장(편집마다 저장,
-- 편집 상태를 버릴 수 없음)을 얹을 수 없다.
--
-- 이 마이그레이션이 하는 일:
--   1) changes.position — 명시적 순서. update_pending_ingestion이 더는
--      DELETE+INSERT로 순서를 흩지 않고, 클라가 보낸 값을 그대로 저장한다.
--   2) changesets.draft_version — 초안 버전. 저장이 성공할 때마다 1 올라간다.
--      update가 expectedVersion을 받아 어긋나면 NM012로 거절한다(두 탭 동시 편집
--      가드 — 기존 NM008 "상태가 바뀜"과는 뜻이 다르다).
--   3) changesets.draft_snapshot — 추출 직후 원본 그대로, 이후 절대 안 바뀐다.
--      나중에 "엔진 제안 대비 최종 초안 비교"에 쓸 기준. 지금은 저장만 하고
--      어디서도 조회하지 않는다(digestReview.get 출력에 없음 — 페이로드 절약).
--   4) update_pending_ingestion을 DELETE+INSERT에서 id 기준 upsert로 전환 —
--      클라이언트가 보낸 id는 유지, 없던 id는 새로 생성, 빠진 id는 삭제.
--      new_reference_keys는 이제 실제 target_id를 직접 가리키므로(id가 저장을
--      거쳐도 안 바뀜) create_ingestion_review가 쓰는 key→uuid 매핑이 더는
--      필요 없다 — 엔진(LLM) 제안은 여전히 임의 문자열 key를 쓰므로
--      write_ingestion_review_changes(create 전용)의 그 매핑은 그대로 둔다.
-- =============================================================

-- ----- 1) 스키마 -----

ALTER TABLE changes ADD COLUMN position integer;

ALTER TABLE changesets
  ADD COLUMN draft_version  integer,
  -- 원본 스냅샷 — create_ingestion_review가 딱 한 번 채우고 이후 어떤 RPC도
  -- 갱신하지 않는다(불변 invariant, 코드 레벨로만 지킨다).
  ADD COLUMN draft_snapshot jsonb;

-- 기존에 열려 있는 ingestion 리뷰(있다면)에 시작 버전을 부여 — 이후 저장부터
-- 버전 가드가 걸린다. draft_snapshot은 소급 불가라 비워둔다(추출 시점 데이터가
-- 이미 사라짐 — 위 코멘트 "지금 안 넣으면 소급 불가").
UPDATE changesets SET draft_version = 1 WHERE type = 'ingestion' AND status = 'open';

-- 기존 digest/reference create-change에 순서를 부여 — 지금까지의 사실상 랜덤
-- 순서(created_at, id)를 그대로 얼려 다음 저장 전까지는 화면이 바뀌지 않게 한다.
WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY changeset_id, target_type ORDER BY created_at, id
  ) - 1 AS rn
  FROM changes
  WHERE action = 'create' AND target_type IN ('digest', 'reference')
)
UPDATE changes c SET position = ordered.rn FROM ordered WHERE c.id = ordered.id;

-- ----- 2) write_ingestion_review_changes(create 전용 공통 몸통) — position 부여 -----
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
  v_cited_keys jsonb;
  v_key_ids    jsonb := '{}'::jsonb;
  v_ref_id     uuid;
  v_digest_id  uuid;
  v_ref_ids    jsonb;
  v_before     text;
BEGIN
  SELECT coalesce(jsonb_agg(DISTINCT cited.key), '[]'::jsonb) INTO v_cited_keys
  FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb)) AS digest(value),
       jsonb_array_elements_text(coalesce(digest.value->'new_reference_keys', '[]'::jsonb)) AS cited(key);

  FOR v_item, v_pos IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    CONTINUE WHEN NOT (v_cited_keys ? (v_item->>'key'));
    v_ref_id := gen_random_uuid();
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

  -- 기존 Reference 병합 — 순서 개념 없음(대상 정체성이 reference_id 자체).
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

    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    VALUES (
      p_changeset_id, 'create', 'digest', v_digest_id,
      (v_item - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids),
      v_pos
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 3) create_ingestion_review — draft_version=1 + draft_snapshot 채움 -----
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
  -- draft_snapshot은 엔진이 낸 원본 그대로(추출 직후 1회만) — 이후 어떤 저장도 이
  -- 컬럼을 건드리지 않는다.
  INSERT INTO changesets (space_id, type, status, source_id, title, draft_version, draft_snapshot)
  VALUES (
    v_space_id, 'ingestion', 'open', p_source_id, v_source_title, 1,
    jsonb_build_object(
      'digests', p_digests,
      'new_references', p_new_references,
      'reference_updates', p_reference_updates
    )
  )
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 4) update_pending_ingestion — id 기준 upsert + 버전 가드 -----
--
-- 시그니처에 p_expected_version이 추가돼 CREATE OR REPLACE로 못 덮는다(인자 개수
-- 변경, 20260715100000과 같은 사정) — DROP 후 재생성한다.
DROP FUNCTION update_pending_ingestion(uuid, jsonb, jsonb, jsonb);

CREATE FUNCTION update_pending_ingestion(
  p_changeset_id      uuid,
  p_expected_version  integer,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
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
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review', p_changeset_id;
  END IF;
  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — trash the source instead';
  END IF;

  -- 두 탭 동시 편집 가드 — 이 changeset을 마지막으로 읽은 뒤 다른 저장이 먼저
  -- 성공했으면 이 저장은 그 편집을 덮지 않고 거절한다. 기존 NM008("상태가
  -- 바뀜": open이 아니게 됨 등)과는 뜻이 달라 별도 코드로 구분한다.
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'ingestion review % draft version mismatch (expected %, got %) — refresh',
      p_changeset_id, v_version, p_expected_version
      USING ERRCODE = 'NM012';
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

  -- ----- 신규 Reference 후보: id 기준 upsert -----
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

  -- 페이로드에서 빠진 id = 사용자가 그 사이 후보를 삭제함
  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
    AND NOT (target_id = ANY(v_keep_refs));

  -- ----- 기존 Reference 병합(modify): 대상 정체성이 reference_id 자체라 전량 교체 -----
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

  -- ----- Digest 후보: id 기준 upsert -----
  -- new_reference_keys는 이제 위에서 이미 유지된 실제 target_id를 직접 가리킨다
  -- (create 경로의 엔진 임의 key→uuid 매핑과 달리, 여기 오는 id는 항상 get()이
  -- 내려준 값이거나 이번 저장에서 막 upsert된 값이라 별도 해석이 필요 없다).
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    v_digest_id := (v_item->>'id')::uuid;
    v_keep_digests := array_append(v_keep_digests, v_digest_id);

    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs;

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

  UPDATE changesets SET draft_version = draft_version + 1
  WHERE id = p_changeset_id
  RETURNING draft_version INTO v_new_version;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
