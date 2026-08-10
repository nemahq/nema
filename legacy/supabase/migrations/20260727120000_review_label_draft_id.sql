-- =============================================================
-- 리뷰 초안의 Topic/Tag 항목에 안정적인 id 부여
--
-- Digest 리뷰 초안의 Topic/Tag는 지금까지 저장 형태에 자기 식별자가 없었다
-- (topics는 순수 문자열 배열, tags는 {title, description}). 그래서 화면이 항목을
-- 배열 인덱스로 가리킬 수밖에 없었는데, 칩을 "신규 먼저 / 기존 나중"으로 정렬하면
-- 화면 순서와 배열 순서가 갈라져 인덱스가 엉뚱한 항목을 지우거나 고친다.
--
-- 20260727090000이 digest·reference 후보에 한 것과 같은 처방을 라벨에도 적용한다 —
-- 항목마다 id를 하나 못박고, 저장을 거쳐도 그 값이 그대로 왕복하게 한다. 다만 신규
-- Reference의 예약 id와 달리 이 id는 **확정 시 만들어질 topics/tags 행의 PK가 아니다**.
-- confirm의 find-or-create는 그대로 이름 기준이고(레지스트리에 있으면 그 행 재사용),
-- 이 id는 초안이 살아있는 동안 "이 항목"을 가리키는 용도로만 쓰인다.
--
-- 저장 형태:
--   topics: ["배포 도구 선정"]                    → [{"id": uuid, "title": "배포 도구 선정"}]
--   tags:   [{"title": ..., "description": ...}]  → [{"id": uuid, "title": ..., "description": ...}]
--
-- 이 형태는 ingestion 리뷰의 digest create-Change에만 적용된다. manual(confirm_digest_edit)·
-- relation(resolve_duplicate_relation) changeset의 digest create-Change는 이미 확정된
-- 결과의 기록이라 저장·재조회되는 초안 단계 자체가 없다 — 거기에 항목 id를 넣으면 아무도
-- 안 쓰는 값이 되므로 문자열 그대로 둔다. 지금 changes.data->'topics'의 실제 reader는
-- confirm_ingestion_review·getReview 둘뿐이고 둘 다 이미 ingestion으로 좁혀져 있어
-- 당장 분기가 필요하진 않다 — 다만 이후 이 컬럼을 읽는 코드가 새로 생기면 changeset
-- type부터 봐야 한다는 걸 유의할 것.
--
-- 주의(20260726093453과 같은 사정): 아래 confirm_ingestion_review는 파일 타임스탬프가
-- 머지 순서보다 우선하므로, 같은 함수를 건드리는 다른 브랜치가 있으면 머지 시점에
-- 최신 본문 위에 이 변경(topics 읽기)이 남아있는지 재확인해야 한다.
-- =============================================================

-- ----- 1) 기존 초안 백필 -----
--
-- 이미 열려 있는 리뷰의 changes.data를 새 형태로 옮긴다. 닫힌 ingestion changeset도
-- 함께 옮겨 같은 type 안에서 형태가 갈라지지 않게 한다 — 지금은 대응하는 reader가 없지만
-- (changeset-detail-service.ts는 확정 후 라이브 topics/tags 테이블을 조인해 읽지
-- changes.data를 안 본다), 두 형태가 섞인 채로 남겨두면 나중에 이 컬럼을 읽는 코드가
-- 생길 때마다 분기가 필요해진다. 원소가 이미 새 형태면 그대로 둬 재실행해도 id가
-- 바뀌지 않는다.
UPDATE changes c
SET data = c.data || jsonb_build_object(
  'topics', (
    SELECT coalesce(jsonb_agg(
      CASE WHEN jsonb_typeof(t.value) = 'string'
        THEN jsonb_build_object('id', gen_random_uuid(), 'title', t.value #>> '{}')
        ELSE t.value
      END ORDER BY t.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(c.data->'topics', '[]'::jsonb))
      WITH ORDINALITY AS t(value, ord)
  ),
  'tags', (
    SELECT coalesce(jsonb_agg(
      CASE WHEN t.value ? 'id'
        THEN t.value
        ELSE jsonb_build_object('id', gen_random_uuid()) || t.value
      END ORDER BY t.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(c.data->'tags', '[]'::jsonb))
      WITH ORDINALITY AS t(value, ord)
  )
)
FROM changesets cs
WHERE cs.id = c.changeset_id
  AND cs.type = 'ingestion'
  AND c.target_type = 'digest'
  AND c.action = 'create';

-- 배포 순서 안전장치 — CI는 마이그레이션을 동기로 먼저 적용하고 서버 배포는 비동기로
-- 뒤따르므로(.github/workflows/ci.yml), 위 백필이 반영된 후에도 몇 분간 구 서버 코드가
-- 계속 요청을 받는다. 그 창에서 구 서버는 topics를 string[]로 저장하는데(자동저장),
-- update_pending_ingestion은 topics/tags 형태를 검증하지 않고 그대로 받아 저장하므로
-- 백필을 되돌릴 수 있다 — 그 changeset은 새 서버 배포 후 조회·확정·저장 전부 막힌다
-- (실제로 되돌아가지 않아도, 안전하게 한 번 더 거절하는 쪽이 유일한 실패 모드다).
-- draft_version을 올려, 백필 시점에 이미 리뷰 화면을 열어두고 있던(캐시된 expectedVersion이
-- 이 값을 못 따라옴) 구 클라이언트의 저장을 NM012(새로고침 필요)로 거절되게 한다 —
-- open 리뷰만 대상이다(닫힌 changeset은 update_pending_ingestion 자체가 막는다).
UPDATE changesets
SET draft_version = draft_version + 1
WHERE type = 'ingestion'
  AND status = 'open'
  AND id IN (
    SELECT DISTINCT changeset_id FROM changes
    WHERE target_type = 'digest' AND action = 'create'
  );

-- ----- 2) write_ingestion_review_changes — 엔진 산물의 라벨에 id 부여 -----
--
-- 엔진 계약(topics: string[], tags: [{title, description}])은 그대로 둔다 — 엔진엔
-- "초안 항목의 정체성"이라는 개념이 없다. 저장 형태를 소유한 이 RPC가 적재 시점에
-- 항상 새 id를 채운다(호출자가 id를 실어 보내도 무시 — 아래 v_tags 병합 방향 참고).
-- 사용자 경로(update_pending_ingestion)는 화면이 만들어 보낸 id를 그대로 저장하므로
-- (신규 Reference와 같은 왕복) 손댈 것이 없다.
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
  v_topics     jsonb;
  v_tags       jsonb;
  v_before     text;
BEGIN
  -- 인용된 key 집합 — 여기 없는 신규 레퍼런스 제안은 적재하지 않는다 (#356,
  -- 20260707150000_filter_uncited_review_references.sql). 안 지키면 사용자가
  -- 인용을 지우거나 그 digest를 삭제하고 확정할 때 고아 active Reference가
  -- 레지스트리에 남아 이후 digestion 프롬프트를 오염시킨다.
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
  -- 대상은 확정 전 다듬을 값이므로 지금 원본 body를 before로 잡아 {before,
  -- after}로 자기완결하게 남긴다. before/after 형태는 update_reference와
  -- 같지만 archive된 대상 처리 정책은 다르다: 여기(공통 헬퍼)는 non-active면
  -- 조용히 스킵한다 — 워커(create) 경로에서 생성~적재 사이 대상이 정리돼도
  -- 리뷰 생성 전체를 막지 않기 위함이다. 사용자가 직접 쓴 병합이 조용히
  -- 유실되지 않도록 하는 엄격성은 사용자 경로(update_pending_ingestion)가
  -- NM008로 따로 강제한다. 대상은 이 changeset의 워크스페이스 소속
  -- active Reference만 — 다른 워크스페이스 id를 실은 draft가 남의 body를
  -- before 스냅샷으로 끌어오지 못하게 막는다(confirm의 workspace 가드와
  -- 이중). 실제 변화가 없으면 빈 modify를 안 만든다. 인용·중복 필터는
  -- 호출부가 책임진다(worker=normalize, user=FE) — p_new_references와 같은
  -- 신뢰 계약.
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

    SELECT coalesce(jsonb_agg(
      jsonb_build_object('id', gen_random_uuid(), 'title', t.value #>> '{}') ORDER BY t.ord
    ), '[]'::jsonb) INTO v_topics
    FROM jsonb_array_elements(coalesce(v_item->'topics', '[]'::jsonb)) WITH ORDINALITY AS t(value, ord);

    -- (t.value - 'id') || jsonb_build_object(...) — 오른쪽 피연산자가 이기는 jsonb ||
    -- 병합 순서상, 호출자가 실수로 tags[].id를 실어 보내도 여기서 새로 만든 id로
    -- 덮는다(엔진 경로는 지금 id를 안 보내 도달하지 않지만, 이 함수가 "항상 새로
    -- 채운다"는 선언을 코드로도 지킨다).
    SELECT coalesce(jsonb_agg(
      (t.value - 'id') || jsonb_build_object('id', gen_random_uuid()) ORDER BY t.ord
    ), '[]'::jsonb) INTO v_tags
    FROM jsonb_array_elements(coalesce(v_item->'tags', '[]'::jsonb)) WITH ORDINALITY AS t(value, ord);

    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    VALUES (
      p_changeset_id, 'create', 'digest', v_digest_id,
      (v_item - 'new_reference_keys') || jsonb_build_object(
        'reference_ids', v_ref_ids,
        'topics',        v_topics,
        'tags',          v_tags
      ),
      v_pos
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 3) confirm_ingestion_review — 새 저장 형태에서 이름을 읽는다 -----
--
-- 최신 본문(20260726093453_changeset_status_outcome_reapply)에서 topics 원소를 읽는
-- 한 줄만 바뀐다(문자열 → {id, title}의 title). find-or-create는 그대로 이름 기준이고,
-- 항목 id는 여기서 읽지 않는다 — 초안용 값이지 topics 행의 PK가 아니다. tags는 이미
-- 객체를 ->>'title'로 읽고 있어 늘어난 id 키를 무시하므로 그대로다.
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

    -- 주제 레지스트리 find-or-create + 연결 (find-or-create 관용구). value->>'title'은
    -- value가 옛 형태(순수 문자열)면 NULL을 낸다 — btrim(v_name) = ''는 NULL에서 NULL이라
    -- CONTINUE를 못 뚫고 그대로 topics.title에 NULL을 넣어 NOT NULL 위반(23502)으로
    -- 죽는다. 태그 루프(바로 아래, coalesce(v_tag->>'title', ''))와 같은 결로 맞춘다.
    FOR v_name IN
      SELECT value->>'title' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_name, '')) = '';
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
