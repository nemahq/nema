-- =============================================================
-- Changeset.title — 생성 시점에 채워지는 표시용 제목
-- (07-modeling.md, design-decisions-log "number는 착지, title은 다음 슬라이스로
--  남음"의 후속. 지금까지 listChangesets는 ingestion만 연결된 Source의 title을
--  조인해 대신 썼고(design-decisions-log 2026-07-16 항목), relation·revert는
--  대체 표기가 아예 없어 FE가 "{번호}번째 변경" 자리표시자를 보여줬다.)
--
-- number(PR 번호 역할)는 트리거 하나로 모든 INSERT 경로를 묶었지만, title은
-- 같은 방식을 못 쓴다 — 타입마다 원천 데이터가 다르고(ingestion=Source 제목,
-- relation=끝점 두 Statement가 속한 Digest 제목 조합, revert=원본 제목,
-- manual=대상 콘텐츠 제목), 특히 relation의 원천(from/to statement id)은
-- changesets INSERT 시점엔 아직 없는 changes 자식 행에 있어 BEFORE INSERT
-- 트리거로 계산할 수조차 없다. 그래서 number와 달리 각 생성 RPC 안에서
-- 명시적으로 채운다(ingestion만 예외 — 아래 3번 참고).
--
-- nullable로 시작한다 — ingestion의 Source 제목은 생성 콜과 분리된 별도 LLM
-- 콜(fill_source_title)이라 changeset 생성 시점에 아직 없을 수 있고(도착 시
-- 트리거가 갱신), relation·revert·manual도 원천이 없으면 null로 둔다.
-- changesetDisplayTitle(FE)은 이미 null을 효과 요약으로 폴백하는 경로가 있다.
-- =============================================================

ALTER TABLE changesets ADD COLUMN title text;

-- =============================================================
-- 1) create_ingestion_review — title을 그 시점의 Source 제목으로 초기화
--
--   title 생성 LLM 콜(fill_source_title)이 다이제스천 완료 콜과 분리돼 있어
--   둘의 도착 순서가 레이스다 — title 콜이 먼저 끝나면 이 시점에 이미 차 있고,
--   아니면 아직 null이다. 그 시점 값을 한 번 그대로 복사하고, 이후
--   sources.title이 바뀌면 아래 2번 트리거가 갱신한다.
-- =============================================================

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
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id, v_source_title)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) sources.title → 연결된 ingestion changeset.title 전파 트리거
--
--   착지 지점이 fill_source_title(엔진 LLM 콜)과 update_source_title(사람 편집
--   — update_source_body와 달리 열린 리뷰를 막지 않으므로 리뷰가 열린 동안에도
--   Source 제목을 바꿀 수 있다) 두 곳이다. 각 RPC 안에 UPDATE changesets를
--   따로 심는 대신 트리거 하나로 묶는다 — number 컬럼이 흩어진 INSERT 전체를
--   트리거로 묶은 것과 같은 이유(20260714140000): 앞으로 title UPDATE 경로가
--   늘어나도 이 트리거가 자동으로 따라간다.
--
--   type='ingestion'만 갱신한다 — relation도 source_id를 가지지만(중복 판정
--   배치), 그쪽 title은 끝점 Digest 제목 조합이라 Source 제목과 무관하다.
-- =============================================================

CREATE FUNCTION propagate_source_title_to_changeset()
RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE changesets
    SET title = NEW.title
    WHERE source_id = NEW.id AND type = 'ingestion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sources_propagate_title_to_changeset
  AFTER UPDATE OF title ON sources
  FOR EACH ROW EXECUTE FUNCTION propagate_source_title_to_changeset();

-- =============================================================
-- 3) apply_relation_changesets — pending 제안 changeset에 title 채움
--
--   "A(Digest 제목) vs B(Digest 제목)" — 끝점 두 Statement가 각각 속한
--   Digest의 제목을 합친다. applied 블록(자동 적용, 여러 관계를 한 changeset에
--   배치)은 changeset 하나가 여러 쌍을 담을 수 있어 "A vs B" 단일 제목이 안
--   맞는다 — 사람이 판정하는 pending 제안(changeset 1개 = 쌍 1개, conflicts·
--   duplicates 모두 여기로 흘러온다, 20260707170000)만 채운다. duplicates 승인은
--   apply_pending_relation이 기존 changeset을 그대로 쓰므로(새 changeset 안 만듦)
--   여기서 채운 title이 그대로 남는다.
-- =============================================================

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

  -- ----- applied: 관계 행 생성 후, 실제로 생긴 게 있을 때만 변경셋을 묶는다 -----
  INSERT INTO changesets (space_id, type, status, source_id)
  VALUES (v_space_id, 'relation', 'applied', p_source_id)
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

  -- ----- pending: 건당 변경셋 1개. title = 끝점 Digest "A vs B" -----
  -- 애매·모순(conflicts)·같음(duplicates) 모두 여기로 흘러 사람 검토를 거친다.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pending)
  LOOP
    -- 재시도가 같은 쌍을 다시 제안하면 기존 pending 변경셋을 건너뛴다. 사람이
    -- 거절(rejected)한 쌍도 다시 올리지 않는다 — pending·rejected를 함께 본다.
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM changesets c
      JOIN changes ch ON ch.changeset_id = c.id
      WHERE c.space_id = v_space_id
        AND c.type = 'relation' AND c.status IN ('pending', 'rejected')
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
      v_space_id, 'relation', 'pending', p_source_id,
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

-- =============================================================
-- 4) revert_changeset — title = "{원본 제목} 되돌림"
--
--   원본이 그 자신도 revert(redo)일 수 있어 title이 체인으로 이어진다 —
--   "X 되돌림 되돌림"처럼 겹쳐 쌓이는 게 정확한 표현이다(되돌리기를 두 번
--   하면 실제로 그런 상태이므로). 원본 title이 null이면(효과 요약 폴백 중인
--   원본) 이 revert도 null로 남아 같은 폴백을 그대로 물려받는다.
-- =============================================================

CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_source_id     uuid;
  v_orig_title    text;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
BEGIN
  SELECT space_id, type, source_id, title
    INTO v_space_id, v_type, v_source_id, v_orig_title
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, reverts_id, author_id, title)
  VALUES (
    v_space_id, 'revert', 'applied', p_changeset_id, auth.uid(),
    CASE WHEN v_orig_title IS NOT NULL THEN v_orig_title || ' 되돌림' END
  )
  RETURNING id INTO v_revert_id;

  -- ingestion 예외: changes 밖의 원본(source_id)도 pending으로 되돌린다
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
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id;
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 5) manual — 대상 콘텐츠의 title을 그대로 옮겨온다
--
--   confirm_digest_edit(Digest 수정)은 브리핑이 명시한 케이스. update_reference·
--   archive_reference는 명시되진 않았지만 대상 행에 title이 이미 있어 추가
--   조회 없이(또는 RETURNING 한 컬럼만 늘려서) 같은 패턴을 일관되게 적용할 수
--   있어 함께 채운다. archive_statement는 대상(Statement)에 title 개념 자체가
--   없어 제외 — 계속 효과 요약 폴백. archive_source는 v2 Source 상태 모델
--   (20260706112433)에서 이미 제거된 RPC라 애초에 대상이 아니다 — "빼기"는
--   이제 trash_source(pending→trashed)뿐이고, 그 경로는 changeset을 만들지
--   않는다("삭제·복원은 변경이력에 남기지 않는다", 같은 마이그레이션 주석).
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

  -- 확정본 수정이라 원본이 active여야 한다(pending/trashed 원본의 digest는 수정 대상 아님).
  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'active') THEN
    RAISE EXCEPTION 'source % of digest % is not active', v_source_id, p_digest_id;
  END IF;

  v_author_id := auth.uid();

  -- manual changeset — source_id 유지(Y). 사람 주도라 author_id 채움.
  -- title = 새 Digest의 제목(수정 결과를 대표).
  INSERT INTO changesets (space_id, type, status, source_id, author_id, title)
  VALUES (v_space_id, 'manual', 'applied', v_source_id, v_author_id, p_digest->>'title')
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
  -- linking도 pending으로 되돌린다(잇기 배치는 원본 단위라 전체 재판정).
  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

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

  -- title = 수정 결과(post-edit) 제목 — 제목 자체가 이번 수정 대상이 아니었어도
  -- p_title은 diff 계약상 항상 "현재 제목"과 같은 값이라 그대로 쓸 수 있다.
  INSERT INTO changesets (space_id, type, status, author_id, title)
  VALUES (NULL, 'manual', 'applied', auth.uid(), p_title)
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

CREATE OR REPLACE FUNCTION archive_reference(p_reference_id uuid)
RETURNS uuid AS $$
DECLARE
  v_workspace_id uuid;
  v_title        text;
  v_changeset_id uuid;
BEGIN
  UPDATE "references"
  SET status = 'archived'
  WHERE id = p_reference_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  RETURNING workspace_id, title INTO v_workspace_id, v_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can archive', p_reference_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id, title)
  VALUES (NULL, 'manual', 'applied', auth.uid(), v_title)
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'reference', p_reference_id);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 6) 기존 changeset 백필
--
--   ingestion → 그 시점 Source 제목. manual → 대상 콘텐츠(Digest/Reference)의
--   현재 제목. relation → pending 제안(conflicts·duplicates 전부 포함)만 끝점
--   Digest 제목으로 재계산 — applied 배치(위 3번과 같은 이유로 여러 쌍이 한
--   changeset에 실림)는 null 유지, 효과 요약 폴백 그대로. revert → 원본 title
--   + " 되돌림", 체인 깊이만큼 수렴할 때까지 반복.
-- =============================================================

UPDATE changesets c
SET title = s.title
FROM sources s
WHERE c.source_id = s.id AND c.type = 'ingestion';

UPDATE changesets c
SET title = d.title
FROM changes ch JOIN digests d ON d.id = ch.target_id
WHERE ch.changeset_id = c.id
  AND ch.target_type = 'digest' AND ch.action = 'create'
  AND c.type = 'manual' AND c.title IS NULL;

-- modify는 그 편집 시점의 {before, after}가 changes.data에 남아있다 — title
-- 자체가 그 편집의 대상이었으면 after.title이 정확한 그 시점 값, 아니면(다른
-- 필드만 바뀐 편집) title은 그 편집으로 변하지 않았으므로 현재 값이 곧 그
-- 시점 값과 같다.
UPDATE changesets c
SET title = coalesce(ch.data->'after'->>'title', r.title)
FROM changes ch JOIN "references" r ON r.id = ch.target_id
WHERE ch.changeset_id = c.id
  AND ch.target_type = 'reference' AND ch.action = 'modify'
  AND c.type = 'manual' AND c.title IS NULL;

UPDATE changesets c
SET title = r.title
FROM changes ch JOIN "references" r ON r.id = ch.target_id
WHERE ch.changeset_id = c.id
  AND ch.target_type = 'reference' AND ch.action = 'archive'
  AND c.type = 'manual' AND c.title IS NULL;

UPDATE changesets c
SET title = pair.title
FROM (
  SELECT ch.changeset_id,
         df.title || ' vs ' || dt.title AS title
  FROM changes ch
  JOIN statements sf ON sf.id = (ch.data->>'from_id')::uuid
  JOIN digests df ON df.id = sf.digest_id
  JOIN statements st ON st.id = (ch.data->>'to_id')::uuid
  JOIN digests dt ON dt.id = st.digest_id
  WHERE ch.target_type = 'relation' AND ch.action = 'create'
) pair
WHERE c.id = pair.changeset_id
  AND c.type = 'relation' AND c.status = 'pending';

DO $$
DECLARE
  v_updated int;
BEGIN
  LOOP
    UPDATE changesets r
    SET title = orig.title || ' 되돌림'
    FROM changesets orig
    WHERE r.type = 'revert'
      AND r.reverts_id = orig.id
      AND r.title IS NULL
      AND orig.title IS NOT NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXIT WHEN v_updated = 0;
  END LOOP;
END $$;
