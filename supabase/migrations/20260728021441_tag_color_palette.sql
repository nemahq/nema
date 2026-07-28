-- =============================================================
-- Tag에 색상 부여 (07-modeling.md — "사용자가 의도적으로 고르는 표시 색상")
--
-- Tag는 재사용되는 분류 라벨인데 이름만 보고는 성격이 안 보인다("기술결정"이
-- 위험한 건지 가벼운 건지 이름으로는 모른다). weave에 이미 AA 대비까지 검증된
-- TagColor 8종(slate·cyan·sage·olive·terracotta·rose·mauve·violet,
-- packages/weave/src/components/Chip.tsx)이 있어 새 팔레트는 만들지 않는다.
-- 색은 콘텐츠 이해와 무관한 순수 표시값이라 엔진 프롬프트엔 넣지 않고, 순수
-- 랜덤 함수로 8개 중 하나를 뽑는다. Topic은 이름 자체가 자기설명적이라 이번
-- 스코프에 없다 — 계속 중립(색 없음).
--
-- 배정 시점 = id를 배정하는 바로 그 자리(#515, 20260727120000):
--   - 엔진 제안 Tag: write_ingestion_review_changes가 draft(changes.data->'tags')에
--     id와 함께 색도 채운다(아래).
--   - 사용자가 리뷰 화면에서 직접 만드는 신규 Tag: TagEditPanel.tsx의
--     handleCreateNew가 크립토 id를 만드는 자리에서 색도 같이 뽑아 생성 폼에
--     미리 채운다(FE 담당, 이 마이그레이션과 무관).
--   - 레지스트리 tags 행: color 컬럼에 DEFAULT random_tag_color()를 걸어
--     create_tag RPC·confirm_digest_edit·resolve_duplicate_relation 등
--     (workspace_id, title, description)만 명시하는 모든 INSERT 경로가 컬럼
--     하나 안 건드리고도 자동으로 커버되게 한다 — 이 find-or-create 패턴이
--     여러 함수에 중복돼 있어(confirm_digest_edit, resolve_duplicate_relation,
--     create_tag, confirm_ingestion_review), 매 INSERT 지점을 일일이 쫓는
--     것보다 DEFAULT 하나가 안전하다.
--   - 단, confirm_ingestion_review의 find-or-create만 예외로 손댄다 — 여기는
--     리뷰 화면에 이미 보여준 draft의 색을 그대로 이어받아야 사용자가 리뷰에서
--     본 색과 확정 후 저장된 색이 어긋나지 않는다(DEFAULT에 맡기면 매번 다시
--     뽑아 WYSIWYG이 깨진다).
--
-- 기존 태그 전체도 이 마이그레이션이 한 번 백필한다(최초 배정만 — 기존 태그의
-- 색을 다시 고치는 진입점은 Digest 상세가 생길 때까지 없다, 이번 스코프 밖).
-- 사용자는 생성 폼·편집 팝오버 어디서든 항상 자유롭게 바꿀 수 있다(엔진·랜덤
-- 함수가 채운 값은 초깃값일 뿐).
--
-- 주의(20260726093453·20260727120000과 같은 사정): 아래 write_ingestion_review_changes·
-- confirm_ingestion_review는 파일 타임스탬프가 머지 순서보다 우선하므로, 같은
-- 함수를 건드리는 다른 브랜치가 있으면 머지 시점에 최신 본문 위에 이 변경(색
-- 배정)이 남아있는지 재확인해야 한다.
-- =============================================================

CREATE TYPE tag_color AS ENUM (
  'slate', 'cyan', 'sage', 'olive', 'terracotta', 'rose', 'mauve', 'violet'
);

-- 8개 팔레트를 이 함수 하나에 못박아, 컬럼 DEFAULT와 draft 배정(아래
-- write_ingestion_review_changes) 두 자리가 같은 목록을 중복해서 들고 있지
-- 않게 한다. enum 순서에 기대지 않고 매번 무작위로 하나를 고른다.
CREATE FUNCTION random_tag_color() RETURNS tag_color AS $$
  SELECT v FROM unnest(enum_range(NULL::tag_color)) AS v ORDER BY random() LIMIT 1;
$$ LANGUAGE sql;

-- ----- 1) tags 테이블에 color 컬럼 추가 + 기존 행 백필 -----
ALTER TABLE tags ADD COLUMN color tag_color;
UPDATE tags SET color = random_tag_color() WHERE color IS NULL;
ALTER TABLE tags ALTER COLUMN color SET DEFAULT random_tag_color();
ALTER TABLE tags ALTER COLUMN color SET NOT NULL;

-- ----- 2) 기존에 열려 있는(또는 닫힌) ingestion 리뷰 초안의 tags에도 색을 채운다 -----
-- id 백필(20260727120000)과 같은 이유 — 이 마이그레이션 이전에 만들어진 draft는
-- changes.data->'tags' 원소에 color 키가 없어 리뷰 화면이 그릴 색이 없다. 이미
-- 채워진 원소(재실행)는 그대로 둔다.
UPDATE changes c
SET data = c.data || jsonb_build_object(
  'tags', (
    SELECT coalesce(jsonb_agg(
      CASE WHEN t.value ? 'color'
        THEN t.value
        ELSE t.value || jsonb_build_object('color', random_tag_color())
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

-- ----- 3) write_ingestion_review_changes — 엔진 산물의 Tag draft에 색 배정 -----
-- 본문은 20260727120000과 동일, v_tags 조립에 color만 추가한다.
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
    -- 병합 순서상, 호출자가 실수로 tags[].id나 color를 실어 보내도 여기서 새로
    -- 뽑은 값으로 덮는다(엔진 경로는 지금 id·color를 안 보내 도달하지 않지만,
    -- 이 함수가 "항상 새로 채운다"는 선언을 코드로도 지킨다). color는 콘텐츠
    -- 이해와 무관한 순수 표시값이라 엔진 프롬프트가 아니라 여기서 랜덤으로만
    -- 정해진다.
    SELECT coalesce(jsonb_agg(
      (t.value - 'id') || jsonb_build_object('id', gen_random_uuid(), 'color', random_tag_color())
        ORDER BY t.ord
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

-- ----- 4) confirm_ingestion_review — 레지스트리 삽입에 draft 색을 이어받는다 -----
-- 본문은 20260727120000과 동일, tags INSERT에 color 컬럼만 추가한다.
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

    -- 태그 레지스트리 find-or-create — 기존 태그의 정의(description)·색(color)은
    -- 덮지 않는다: 정의는 재사용 판단 기준이라, 색은 사용자가 의도적으로 고른
    -- 값이라 리뷰 한 번이 조용히 바꾸면 안 된다(ON CONFLICT DO UPDATE에 title만
    -- 있는 이유). color는 draft가 이미 화면에 보여준 값을 그대로 이어받는다 —
    -- 리뷰에서 본 색과 확정 후 저장되는 색이 어긋나면 안 되므로, 레지스트리
    -- 신규 삽입 시에도 컬럼 DEFAULT(매번 다시 랜덤)에 맡기지 않는다. draft에
    -- color가 없는 경우(이 마이그레이션 이전 draft가 새로고침 없이 그대로
    -- 확정되는 좁은 창)만 방어적으로 새로 뽑는다.
    FOR v_tag IN
      SELECT value FROM jsonb_array_elements(coalesce(ch.data->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
      INSERT INTO tags (workspace_id, title, description, color)
      VALUES (
        v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''),
        coalesce((v_tag->>'color')::tag_color, random_tag_color())
      )
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
