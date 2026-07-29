-- changesets.closed_by_id/closed_by_name — "누가 이 changeset을 닫았는지(판정했는지)" 스냅샷
--
-- 기존 author_id/author_name은 "누가 이 changeset의 내용을 만들었나"라 ingestion·relation은
-- 항상 NULL이다(엔진 산물, 07-modeling.md "authorId는 사람이 직접 만든 것에만 붙는다"). 반면
-- "누가 닫았나(판정했나)"는 별개 축이다 — 확신 관계는 엔진이 즉시 닫고(apply_relation_changesets
-- 자동 루프), 그 외(ingestion 리뷰 확정/버리기, 충돌·중복 판정)는 실제로 그 버튼을 누른 사람이
-- 닫는다. 지금까지 changeset-detail-service.getPendingRelationByNumber가 이 값 대신
-- source.author_name(그 changeset을 촉발한 새 원문의 제출자 — 판정자와 무관)을 "리뷰어"로
-- 잘못 내려보내고 있었다(RelationJudgmentScreen 헤더에 그대로 노출됨) — 이 컬럼이 그 자리를
-- 대신한다.
--
-- author_id/author_name과 같은 스냅샷 페어 패턴(짝 불변식 CHECK, 계정 삭제 시 SET NULL +
-- 이름은 생성 시점 값으로 보존) — NULL이면 "AI(엔진)가 닫았다"는 뜻이다. manual·revert
-- changeset은 단일 액션이라 author_id만으로 "누가 만들었고 닫았는지"가 이미 충분해 이 컬럼을
-- 쓰지 않는다(항상 NULL로 남는다 — 짝 불변식과 무관하게 유효).
--
-- 알려진 갭: 이 마이그레이션 이전에 이미 closed된 changeset은 "누가 닫았는지" 자체를 애초에
-- 기록한 적이 없어 되돌려 채울 값이 없다 — author_name 백필(20260726075509)과 달리 여기는
-- 백필하지 않는다. 과거 changeset은 전부 closed_by가 NULL로 남아 "AI가 닫음"으로 보이지만
-- 실제로는 사람이 닫았을 수도 있다(화면 적용은 다음 슬라이스지만, 조회 계약에 미리 남겨두는
-- 한계다).
--
-- 되살리면(reopen) closed_by도 함께 지운다 — restore_ingestion_review/restore_pending_relation은
-- status='open'으로 되돌리면서 outcome도 NULL로 지우는데, closed_by_id/closed_by_name을 같이
-- 지우지 않으면 "A가 버림 → 되살림 → status='open'인데 closed_by=A가 그대로 남는" 상태가
-- 된다. status='open'인 changeset은 아직 아무도 닫지 않은 것이므로 closed_by가 있으면 안 된다
-- (버린 사람 A를 판정자로 잘못 보여주는 이번 슬라이스가 고치려던 것과 같은 종류의 오표시
-- 재발) — 이 파일 맨 아래에서 두 RPC를 함께 갱신한다.
ALTER TABLE changesets
  ADD COLUMN closed_by_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN closed_by_name text;

ALTER TABLE changesets
  ADD CONSTRAINT chk_changesets_closed_by_name_with_id
  CHECK (closed_by_id IS NULL OR closed_by_name IS NOT NULL);

-- ----- confirm_ingestion_review — 사람이 리뷰를 확정(applied)하면 closed_by를 채운다 -----
CREATE OR REPLACE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_author_id    uuid;
  v_author_name  text;
  v_closed_by_id uuid;
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

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'applied',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- discard_ingestion_review — 사람이 리뷰를 버리면(discarded) closed_by를 채운다 -----
CREATE OR REPLACE FUNCTION discard_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_closed_by_id uuid;
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

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'discarded',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- resolve_conflict_relation — 사람이 충돌을 판정(applied)하면 closed_by를 채운다 -----
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
  v_closed_by_id uuid;
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

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'applied',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- resolve_duplicate_relation — 사람이 중복을 병합(applied)하면 closed_by를 채운다.
-- 이 함수는 이미 auth.uid()/표시 이름을 v_author_id/v_author_name에 계산해 새 Digest의
-- author로 쓰고 있다 — 병합을 확정한 사람과 changeset을 닫은 사람이 같은 호출의 같은
-- 주체이므로 그대로 재사용한다(새 지역변수 불필요). -----
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
  UPDATE changesets
  SET status = 'closed', outcome = 'applied', title = p_merged_digest->>'title',
      closed_by_id = v_author_id, closed_by_name = v_author_name
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- reject_pending_relation — 사람이 제안을 거절(discarded)하면 closed_by를 채운다 -----
CREATE OR REPLACE FUNCTION reject_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_closed_by_id uuid;
BEGIN
  v_closed_by_id := auth.uid();

  UPDATE changesets
  SET status = 'closed', outcome = 'discarded',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id
    AND type = 'relation' AND status = 'open'
    AND (v_closed_by_id IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % is not an open relation proposal the caller can reject', p_changeset_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- apply_relation_changesets(확신 관계 자동 적용)는 의도적으로 손대지 않는다 — 배치당
-- changesets를 INSERT ... VALUES (..., 'closed', 'applied', ...)로 바로 닫는 경로라
-- closed_by_id/closed_by_name을 아예 안 채우면 그대로 NULL로 남고, 그게 "AI가 닫음"이라는
-- 이 컬럼의 정의 그 자체다.

-- ----- restore_ingestion_review — 되살리면(status='open') closed_by도 함께 지운다.
-- status='open'인 changeset은 아직 아무도 닫지 않은 것이라 closed_by가 남아있으면 안 된다
-- (버린 사람이 판정자로 잘못 남는 재발 방지, 이 파일 맨 위 주석 참고). -----
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

  UPDATE changesets
  SET status = 'open', outcome = NULL, closed_by_id = NULL, closed_by_name = NULL
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- restore_pending_relation — 되살리면(status='open') closed_by도 함께 지운다
-- (restore_ingestion_review와 같은 이유, 이 파일 맨 위 주석 참고). -----
CREATE OR REPLACE FUNCTION restore_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id          uuid;
  v_status             changeset_status;
  v_outcome            changeset_outcome;
  v_type               changeset_type;
  v_invalidated_by_id  uuid;
  v_relation_type      relation_type;
  v_from_id            uuid;
  v_to_id              uuid;
BEGIN
  SELECT c.space_id, c.status, c.outcome, c.type, c.invalidated_by_id
    INTO v_space_id, v_status, v_outcome, v_type, v_invalidated_by_id
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    -- ERRCODE 없이 두면 query_failed(500)로 떨어져, Space 멤버십을 잃었거나
    -- changeset이 사라진 정상적 거부가 스퓨리어스 500/Sentry로 샌다
    -- (20260727090000의 같은 RAISE에 붙은 선례와 같은 이유로 P0002를 쓴다).
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  -- invalidated_by_id가 있으면 사람이 거절한 게 아니라 다른 판정(중복 병합 등)이
  -- 이 제안의 끝점을 먼저 archive해 자동으로 닫힌 것이다(07-modeling.md "한 Digest가
  -- 여러 곳과 동시에 중복될 수 있다") — 되살릴 판단 자체가 사람 몫이 아니었으므로 막는다.
  IF v_type <> 'relation' OR v_status <> 'closed'
     OR v_outcome IS DISTINCT FROM 'discarded'
     OR v_invalidated_by_id IS NOT NULL THEN
    -- NM008(ingestion 리뷰 전용)이 아니라 NM011을 쓴다 — 이 가드는 특정 엔티티가
    -- 아니라 changeset 자체의 상태(open/closed·outcome)를 보는 것이라 revert_changeset과
    -- 같은 결(NM011 도입 주석 참고).
    RAISE EXCEPTION 'changeset % is not a discarded pending relation changeset the caller can restore', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  -- ->>'type'을 relation_type으로 캐스트해 enum 밖 값(데이터 손상)도 여기서
  -- 바로 걸러지게 한다(캐스트 실패 시 22P02로 던져지고 query_failed(500)로
  -- 떨어진다 — 정상 경로에선 안 생기는 진짜 장애라 그대로 둔다).
  SELECT (ch.data->>'type')::relation_type,
         (ch.data->>'from_id')::uuid,
         (ch.data->>'to_id')::uuid
    INTO v_relation_type, v_from_id, v_to_id
  FROM changes ch
  WHERE ch.changeset_id = p_changeset_id AND ch.target_type = 'relation'
  LIMIT 1;

  IF v_relation_type IS NULL OR v_from_id IS NULL OR v_to_id IS NULL THEN
    RAISE EXCEPTION 'changeset % has no parseable relation change row', p_changeset_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM changesets c
    JOIN changes ch ON ch.changeset_id = c.id
    WHERE c.space_id = v_space_id
      AND c.status = 'open'
      AND ch.target_type = 'relation'
      AND (ch.data->>'type')::relation_type = v_relation_type
      AND (
        (ch.data->>'from_id' = v_from_id::text AND ch.data->>'to_id' = v_to_id::text)
        OR (
          v_relation_type IN ('conflicts', 'duplicates')
          AND ch.data->>'from_id' = v_to_id::text
          AND ch.data->>'to_id'   = v_from_id::text
        )
      )
  ) THEN
    -- NM011이 아니라 NM013 — "changeset 상태가 바뀜"이 아니라 "같은 쌍에 이미
    -- open인 판정이 있다"는 다른 사실이라 새로고침으로는 안 풀린다(그 open
    -- changeset을 먼저 처리해야 함).
    RAISE EXCEPTION 'a relation changeset for the same statement pair is already open'
      USING ERRCODE = 'NM013';
  END IF;

  UPDATE changesets
  SET status = 'open', outcome = NULL, closed_by_id = NULL, closed_by_name = NULL
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
