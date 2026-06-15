-- =============================================================
-- 사람 개입 3/4: 조작 RPC — 빼기·되돌리기·pending 해소
--
--   archive_statement / archive_source   — 빼기(§3): manual 변경셋 + archive
--   revert_changeset                      — 되돌리기/redo(§4): polymorphic 역연산
--   apply_pending_relation                — pending 적용(§5.1): active 관계 보장
--   reject_pending_relation               — pending 거절(§5.2): pending→rejected
--   is_changeset_reverted                 — in-effect 술어(§4.4, 재귀)
--
-- 전부 사용자 경로 — authenticated + 멤버십 검증, SECURITY DEFINER. retry_* RPC와
-- 같은 패턴(auth.uid() NULL이면 운영자 통과). 직접 쓰기는 RLS(SELECT-only)로
-- 막혀 있어 전부 RPC 경유. intervention-design §7.1.
-- =============================================================

-- =============================================================
-- 0) is_changeset_reverted — "되돌려졌나"를 존재로 파생 (§4.4)
--
--   X가 되돌려짐 ⟺ X를 가리키는(reverts_id=X) revert 중 *그 자신이 안 되돌려진*
--   것이 하나라도 있다. 재귀 — redo가 revert를 또 가리키고, 분기(redo 후 X를
--   다시 revert) 가능. 사슬은 얕다(되돌리기 깊이). 멱등 가드와 이력의 "되돌림
--   여부"(§7.2)가 둘 다 이 술어에 기댄다.
-- =============================================================

CREATE OR REPLACE FUNCTION is_changeset_reverted(p_changeset_id uuid)
RETURNS boolean AS $$
DECLARE
  v_child uuid;
BEGIN
  FOR v_child IN
    SELECT id FROM changesets WHERE reverts_id = p_changeset_id
  LOOP
    IF NOT is_changeset_reverted(v_child) THEN
      RETURN true;  -- 유효한(안 되돌려진) revert가 X를 가린다 → X는 되돌려진 상태
    END IF;
  END LOOP;
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 1) archive_statement — 진술 빼기 (§3.1, 헤드라인)
--
--   manual 변경셋 1개 + {archive, statement}. 진술 status=archived +
--   ingestion_status=pending(벡터 축출) + notify. 걸린 관계는 안 건드린다 —
--   끝점 연쇄 트리거(trg_statements_cascade_archive_relations)가 자동 archive.
--   현재 active일 때만(이미 archived면 RAISE — 빈 변경셋 안 남김).
-- =============================================================

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

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (v_space_id, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'statement', p_statement_id);

  -- 워커가 archived 진술의 벡터를 지운다(선언적 동기화, schema §5.3)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 2) archive_source — 원본 빼기 (§3.2)
--
--   manual 변경셋 + {archive, source}. 연쇄 없음(Q1 — 진술 유지), 벡터 없음
--   (원본은 임베딩 안 함), notify 없음(워커 작업 없음). 백엔드 계약은 완비하되
--   v1 화면 헤드라인은 아니다(NEM-133이 노출할지는 화면 몫).
-- =============================================================

CREATE OR REPLACE FUNCTION archive_source(p_source_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE sources
  SET status = 'archived'
  WHERE id = p_source_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an active source the caller can archive', p_source_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (v_space_id, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'source', p_source_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) revert_changeset — 되돌리기/redo (§4), polymorphic
--
--   타겟 변경셋의 changes를 역연산(create/restore→archive, archive→restore)으로
--   적용하고, 그 역연산을 revert 변경셋의 changes로 그대로 기록(자기 기술적 — redo가
--   이 기록만 보고 다시 뒤집는다). 예외 하나: ingestion 되돌리기는 changes 밖의
--   source_id 원본도 archive한다("글 통째로", §4.1 C). 그 archive도 revert 변경셋에
--   기록되므로 redo는 일반 규칙 그대로.
--
--   "그 시점 실제로 일으킨 전이만 기록"(§4.4) — UPDATE의 status 가드가 보장한다.
--   하나도 전이 안 되면 RAISE('nothing to revert')로 빈 revert 변경셋을 롤백.
--   double-revert 가드: 타겟이 현재 in-effect가 아니면 RAISE(더블클릭 멱등).
-- =============================================================

CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_source_id     uuid;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
BEGIN
  SELECT space_id, type, source_id INTO v_space_id, v_type, v_source_id
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, reverts_id, author_id)
  VALUES (v_space_id, 'revert', 'applied', p_changeset_id, auth.uid())
  RETURNING id INTO v_revert_id;

  -- ingestion 예외: changes 밖의 원본(source_id)도 archive ("글 통째로", §4.1)
  IF v_type = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'archived'
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
      CONTINUE;  -- modify는 v1 미생성(§10)
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
      ELSE  -- source
        UPDATE sources SET status = 'archived'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
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
      ELSE  -- source
        UPDATE sources SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

  IF NOT v_did_anything THEN
    -- 전이 대상이 그 시점 하나도 없었다 → 빈 revert 변경셋을 남기지 않는다.
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id;
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 4) apply_pending_relation — pending 적용 (§5.1)
--
--   사후 조건 = "active (from,to,type) 관계가 존재한다". uq_statement_relations_triple
--   이 상태 무관 전체 유니크라 ON CONFLICT가 archived 행과도 충돌하므로, 단순
--   DO NOTHING이면 "적용했는데 active가 안 생기는 조용한 no-op"이 된다(§5.1 A). 그래서
--   기존 행 상태로 분기: 없으면 create(예약 id), archived면 restore, 이미 active면
--   전이 없음(빈 변경셋). 끝점이 비활성이면 RAISE(조용한 거절 금지, §5.1 E).
-- =============================================================

CREATE OR REPLACE FUNCTION apply_pending_relation(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_change_id    uuid;
  v_reserved_id  uuid;
  v_rel_type     relation_type;
  v_from_id      uuid;
  v_to_id        uuid;
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

  -- pending 제안은 change 하나(예약 target_id + data{type,from,to})
  SELECT id, target_id, data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_change_id, v_reserved_id, v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending relation changeset % has no relation change', p_changeset_id;
  END IF;

  -- 끝점 무결성: 대기 중 끝점이 archived됐으면 active 관계를 걸 수 없다(§5.1 E)
  IF NOT EXISTS (SELECT 1 FROM statements WHERE id = v_from_id AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM statements WHERE id = v_to_id AND status = 'active') THEN
    RAISE EXCEPTION 'endpoint no longer active for relation proposal %', p_changeset_id;
  END IF;

  -- (from,to,type)는 상태 무관 유니크 — 기존 행을 먼저 본다.
  SELECT id, status INTO v_existing
  FROM statement_relations
  WHERE from_id = v_from_id AND to_id = v_to_id AND type = v_rel_type;

  IF NOT FOUND THEN
    -- 없음 → 예약 id로 새로 생성. change는 그대로 {create, 예약 id}.
    INSERT INTO statement_relations (id, space_id, type, from_id, to_id)
    VALUES (v_reserved_id, v_space_id, v_rel_type, v_from_id, v_to_id);
    v_relation_id := v_reserved_id;
  ELSIF v_existing.status = 'archived' THEN
    -- 가려져 있던 같은 관계 → 되살림. change를 {restore, 기존 id}로 갱신.
    UPDATE statement_relations SET status = 'active' WHERE id = v_existing.id;
    v_relation_id := v_existing.id;
    UPDATE changes SET action = 'restore', target_id = v_relation_id, data = NULL
    WHERE id = v_change_id;
  ELSE
    -- 이미 active(드문 중복 제안) → 전이 없음. change를 지워 revert가 손대지 않게
    -- 한다(§4.4 "실제 전이만 기록"). 변경셋 헤더는 "적용 결정"의 흔적으로 남는다.
    v_relation_id := v_existing.id;
    DELETE FROM changes WHERE id = v_change_id;
  END IF;

  UPDATE changesets SET status = 'applied' WHERE id = p_changeset_id;

  RETURN v_relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 5) reject_pending_relation — pending 거절 (§5.2)
--
--   pending→rejected. 관계 행 안 만듦. 거절된 제안은 행으로 남아 재제안 가드(4/4)가
--   본다("한 번 아니라고 하면 계속 아니다"). pending은 미적용 잠정 제안이라 terminal
--   전이는 append-only 위반이 아니다.
-- =============================================================

CREATE OR REPLACE FUNCTION reject_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE changesets
  SET status = 'rejected'
  WHERE id = p_changeset_id
    AND type = 'relation' AND status = 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % is not a pending relation proposal the caller can reject', p_changeset_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION is_changeset_reverted FROM public, anon;
GRANT EXECUTE ON FUNCTION is_changeset_reverted TO authenticated, service_role;

REVOKE ALL ON FUNCTION archive_statement FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_statement TO authenticated, service_role;

REVOKE ALL ON FUNCTION archive_source FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_source TO authenticated, service_role;

REVOKE ALL ON FUNCTION revert_changeset FROM public, anon;
GRANT EXECUTE ON FUNCTION revert_changeset TO authenticated, service_role;

REVOKE ALL ON FUNCTION apply_pending_relation FROM public, anon;
GRANT EXECUTE ON FUNCTION apply_pending_relation TO authenticated, service_role;

REVOKE ALL ON FUNCTION reject_pending_relation FROM public, anon;
GRANT EXECUTE ON FUNCTION reject_pending_relation TO authenticated, service_role;
