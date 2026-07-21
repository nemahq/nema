-- =============================================================
-- 관계 판정 RPC 신설 — 충돌 승자 선택 · 중복 병합
-- (07-modeling.md §Relation·§동작 규칙, surface-inventory.md "관계 판정 화면"·
--  "관계 판정 화면(중복/병합)", review-flow.md "관계 판정" 섹션,
--  product-decisions-log.md #18 "발견한 갭 — relation 판정 모드가 백엔드에 없음")
--
-- 지금까지 apply_pending_relation은 파라미터 없이 그냥 "확인"만 했다 — 충돌이면
-- 관계 엣지만 만들고 아무것도 archive하지 않고, 중복이면 진술 하나만 archive할 뿐
-- Digest 병합이 없었다(#18이 지적한 갭). 이 마이그레이션이 그 갭을 메운다:
--
--  1) resolve_conflict_relation — 승자 Statement를 받아 패자를 archive하고
--     승자→패자 `replaces` 관계를 세운다(07-modeling: "진술의 폐기는 replaces에서
--     파생된다"). 원래 제안(conflicts) change row는 그대로 둔다 —
--     changeset-detail-service가 applied 이후에도 이 데이터로 "무엇을 놓고
--     비교했는지"를 렌더링하는 기존 계약이 있어(getChangesetByNumber
--     resolveBody), 덮어쓰면 그 화면이 깨진다.
--  2) resolve_duplicate_relation — 병합 제안 콘텐츠(제목·본문 등)를 받아 confirm_
--     digest_edit과 같은 관용구로 새 Digest를 만들고, 기존 두 Digest(+그 소속
--     진술 전부)를 archive한다. Statement 하나만 가리던 옛 apply_pending_relation
--     의 duplicates 처리와 달리 Digest 단위 병합이다("duplicates는 Digest 둘
--     archive + 하나 create", surface-inventory.md "관계 판정 화면(중복/병합)"
--     모델 절). 이 전환으로 source-service.ts의 fetchMergedSourceIds(NEM-162,
--     keeper 진술이 살아남는다는 전제)는 새 병합 건에는 더 이상 적용되지 않는다
--     — 그 전제가 이 RPC로 깨지기 때문(keeper의 Digest·진술도 archive됨). 과거
--     (이 배포 이전) 병합 데이터는 영향 없다. Kyle 확인 후 진행(2026-07-21).
--  3) 한 Digest가 여러 곳과 동시에 중복될 수 있다 — 캐스케이드: 병합으로 archive된
--     진술을 끝점으로 삼던 다른 pending relation changeset(충돌·중복 모두)은
--     closed(rejected)로 자동 전환하되, invalidated_by_id로 "사람이 아니라
--     대상 소실로 무효화됐다"는 사유를 남긴다(일반 discarded와 구분, 07-modeling.md
--     "한 Digest가 여러 곳과 동시에 중복될 수 있다" 참고). resolve_conflict_relation
--     에도 같은 원리를 일반화 적용(패자 진술이 다른 대기 제안의 끝점일 수 있음).
--  4) cascade_archive_statement_relations — replaces도 duplicates와 같이 끝점
--     연쇄에서 제외. resolve_conflict_relation이 승자→패자 replaces를 만든 *뒤*
--     패자를 archive하는데, 기존 트리거는 duplicates만 제외라 방금 만든 replaces
--     행까지 같은 UPDATE가 archive해버려 "이겼다는 근거"가 사라진다(duplicates_as_
--     relation.sql 원래 주석과 같은 이유 — 이 관계의 상태는 끝점 연쇄가 아니라
--     그 changeset이 몬다).
--  5) apply_relation_changesets 재제안 가드 — invalidated_by_id 반영. 기존 가드는
--     rejected를 전부 "사람이 아니라고 판단함"으로 취급해 영구 차단하는데, 3)의
--     캐스케이드 무효화도 같은 rejected를 쓴다. 대상 소실로 무효화된 쌍은(예: 되돌리기로
--     끝점이 다시 active가 됨) 사람의 판단이 아니었으므로 재제안이 막히면 안 된다 —
--     invalidated_by_id IS NULL(사람이 실제로 거절한 것)일 때만 계속 차단한다.
--
-- Reference·Topic·Tag는 이 병합 대상이 아니다 — 07-modeling.md "레퍼런스·주제·태그는
-- 병합을 고려하지 않음"(Statement 전용).
-- =============================================================

-- =============================================================
-- 0-a) cascade_archive_statement_relations — replaces도 duplicates처럼 제외
-- =============================================================

CREATE OR REPLACE FUNCTION cascade_archive_statement_relations()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'archived' THEN
    UPDATE statement_relations
    SET status = 'archived'
    WHERE status = 'active' AND type NOT IN ('duplicates', 'replaces')
      AND (from_id = NEW.id OR to_id = NEW.id);
  ELSE
    UPDATE statement_relations r
    SET status = 'active'
    WHERE r.status = 'archived' AND r.type NOT IN ('duplicates', 'replaces')
      AND (r.from_id = NEW.id OR r.to_id = NEW.id)
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.from_id AND s.status = 'active')
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.to_id   AND s.status = 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 0-b) changesets.invalidated_by_id — 캐스케이드 무효화 사유
--
--   status='rejected'인데 사람이 "버리기"를 누른 게 아니라 대상(끝점 진술)이
--   다른 병합으로 먼저 archive돼 무효화된 경우를 구분한다. reverts_id와 같은
--   패턴(자기참조 nullable FK) — 어느 changeset이 이걸 무효화했는지 가리킨다.
-- =============================================================

ALTER TABLE changesets
  ADD COLUMN invalidated_by_id uuid REFERENCES changesets(id) ON DELETE SET NULL;

-- =============================================================
-- 0-c) changes(data->>'from_id'|'to_id') 부분 인덱스 — relation 제안 룩업용
--
--   invalidate_stale_relation_proposals(판정 1건마다, 중복 병합은 진술 수만큼
--   반복)와 apply_relation_changesets의 재제안 가드가 둘 다 이 jsonb 텍스트
--   비교로 relation changeset을 찾는다. target_type='relation'으로 좁힌 부분
--   인덱스라 다른 target_type의 changes 행은 인덱스에 안 들어간다.
-- =============================================================

CREATE INDEX idx_changes_relation_from_id ON changes ((data->>'from_id'))
  WHERE target_type = 'relation';
CREATE INDEX idx_changes_relation_to_id ON changes ((data->>'to_id'))
  WHERE target_type = 'relation';

-- =============================================================
-- 1) invalidate_stale_relation_proposals — 내부 헬퍼
--
--   p_statement_id가 끝점(from_id 또는 to_id)인 다른 PENDING relation changeset을
--   전부 찾아 rejected + invalidated_by_id로 닫는다. p_invalidated_by(지금 적용
--   중인 changeset) 자신은 제외 — 그건 호출부가 별도로 applied 처리한다. 직접
--   RPC로 노출하지 않는다(resolve_conflict_relation·resolve_duplicate_relation
--   안에서만 PERFORM).
-- =============================================================

CREATE OR REPLACE FUNCTION invalidate_stale_relation_proposals(
  p_statement_id   uuid,
  p_invalidated_by uuid
)
RETURNS void AS $$
BEGIN
  UPDATE changesets c
  SET status = 'rejected',
      invalidated_by_id = p_invalidated_by
  WHERE c.type = 'relation'
    AND c.status = 'pending'
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

REVOKE ALL ON FUNCTION invalidate_stale_relation_proposals FROM public, anon, authenticated;

-- =============================================================
-- 2) resolve_conflict_relation — 충돌 판정: 승자 선택
-- =============================================================

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
  IF v_type <> 'relation' OR v_status <> 'pending' THEN
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

  UPDATE changesets SET status = 'applied' WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION resolve_conflict_relation(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION resolve_conflict_relation(uuid, uuid) TO authenticated, service_role;

-- =============================================================
-- 3) resolve_duplicate_relation — 중복 판정: 병합
--
--   p_merged_digest 원소: confirm_digest_edit의 p_digest와 같은 계약({title,
--   description, body, topics[], tags[{title,description}], reference_ids[uuid],
--   new_reference_keys[text], external_urls[text]}) — 유저가 편집한 병합 제안
--   그대로. p_new_references도 같은 계약({key, type, title, body, external_urls}).
-- =============================================================

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
  IF v_type <> 'relation' OR v_status <> 'pending' THEN
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
  UPDATE changesets SET status = 'applied', title = p_merged_digest->>'title'
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION resolve_duplicate_relation(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION resolve_duplicate_relation(uuid, jsonb, jsonb) TO authenticated, service_role;

-- =============================================================
-- 4) 옛 apply_pending_relation 제거 — 위 두 RPC로 대체
-- =============================================================

DROP FUNCTION IF EXISTS apply_pending_relation(uuid);

-- =============================================================
-- 5) apply_relation_changesets — 재제안 가드에 invalidated_by_id 반영
--
--   pending·rejected 쌍을 다시 안 올리는 재제안 가드(20260718090000)는 원래
--   "사람이 거절하면 계속 아니다"만 염두에 둔 것이었다. 이제 rejected에는 캐스케이드로
--   무효화된 것도 섞이는데(3), 그건 사람의 판단이 아니라 대상 소실일 뿐이라 — 예를
--   들어 그 병합 changeset이 나중에 revert돼 끝점 진술이 다시 active가 되면 —
--   재제안을 계속 막을 이유가 없다. invalidated_by_id가 있는 rejected는 가드에서
--   뺀다(사람이 실제로 거절한, invalidated_by_id가 NULL인 rejected만 계속 막는다).
--   나머지 로직은 20260718090000과 동일 — 가드 조건 한 줄만 바뀐다.
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
    -- 실제로 거절한(invalidated_by_id가 NULL인) rejected 쌍도 다시 안 올린다 —
    -- 캐스케이드로 무효화된(invalidated_by_id가 있는) rejected는 막지 않는다(5).
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM changesets c
      JOIN changes ch ON ch.changeset_id = c.id
      WHERE c.space_id = v_space_id
        AND (
          c.status = 'pending'
          OR (c.status = 'rejected' AND c.invalidated_by_id IS NULL)
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

REVOKE ALL ON FUNCTION apply_relation_changesets FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_relation_changesets TO service_role;
