-- =============================================================
-- Digest 단독 아카이브·되살리기 + Reference 되살리기 (Manual 편집 잔여 RPC)
--
-- browsing-flow.md "Digest 아카이브"·"아카이브 되살리기"(Digest·Reference 공통).
-- 지금까지 Digest를 archive하는 유일한 경로는 confirm_digest_edit(수정 시
-- 대체하며 archive)뿐이었다 — "대체 없이 그냥 아카이브"할 방법 자체가 없었다.
-- archive_reference는 이미 tRPC로 노출돼 있지만(#465) 되살리기 RPC가 없었다
-- (archive_topic/restore_topic류 되살리기 짝이 없는 상태).
--
-- 되살리기는 archive_topic/restore_topic처럼 status만 뒤집지 않는다 — 07-modeling상
-- Digest·Reference의 archive는 이미 manual changeset으로 기록되므로(archive_topic류와
-- 달리 changeset 이력이 존재), "되살리기"는 그 changeset을 찾아 기존 revert_changeset
-- 하나로 되돌리는 것으로 표현한다(review-flow.md "아카이브 되살리기": "새로운 revert
-- changeset이 즉시 생성된다"). 이 대상을 마지막으로 archive한 changeset은 manual일
-- 수도(archive_digest·confirm_digest_edit·archive_reference), revert일 수도 있다
-- (예: ingestion 되돌리기가 이 Digest를 archive한 경우) — 어느 쪽이든 같은
-- revert_changeset 하나가 옳게 되돌린다(후자는 되돌리기의 되돌리기, 즉 redo).
--
-- 상태 가드 실패는 NM007(Reference, #465가 이미 도입)·NM010(Digest, 신설)으로
-- 던져 error-mapper가 정상적인 동시성 결과로 분류하게 한다(시스템 장애 아님).
-- =============================================================

-- =============================================================
-- 1) archive_digest — Digest 단독 아카이브 (대체 없음)
--
--   digests.status만 다루던 confirm_digest_edit과 달리 이건 대체 Digest를
--   만들지 않는다. 이 Digest에 근거한 active 진술도 연쇄로 archive하고
--   (관계는 trg_statements_cascade_archive_relations 트리거가 처리),
--   manual changeset으로 기록한다. title은 안 채운다 — confirm_digest_edit·
--   archive_reference가 채우는 title은 review-flow.md "Changeset 제목
--   미생성 (manual)"이 "아무 데도 안 쓰이는 불필요한 작업이라 제거 대상"으로
--   명시한 기존 버그라, 새로 쓰는 이 함수까지 그 버그를 따라가지 않는다.
--   pgmq 알림은 실제로 archive된 진술이 있을 때만 보낸다(revert_changeset의
--   v_touched_stmt와 같은 절약).
-- =============================================================

CREATE FUNCTION archive_digest(p_digest_id uuid)
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

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (v_space_id, 'manual', 'applied', auth.uid())
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

-- =============================================================
-- 2) restore_digest / restore_reference — 아카이브 되살리기
--
--   이 대상을 마지막으로 archive한 changeset을 찾아 revert_changeset에
--   위임한다 — 새 로직을 만들지 않고 기존 되돌리기 규칙을 재사용
--   (review-flow.md 세션 노트가 지시한 그대로). 단 manual·revert 타입으로
--   좁힌다 — resolve_duplicate_relation(relation_judgment.sql)처럼 중복
--   병합이 'relation' changeset 안에 "새 Digest 생성 + 옛 Digest 여럿 archive"를
--   함께 담는 경우, 그 changeset을 통째로 revert하면 이 Digest 하나만
--   되살리려던 것이 병합 전체를 취소해버린다(새 Digest도 archive되고 병합
--   상대까지 함께 부활) — 그건 "아카이브 되살리기"가 아니라 "판정 되돌리기"
--   (Changeset 상세의 별도 액션) 몫이라 여기선 대상이 아니다. 동률 방지용으로
--   (created_at, id) 튜플 정렬을 쓴다(#468 keyset 커서와 같은 이유 — 같은
--   트랜잭션 안에서 여러 change가 같은 now()를 가질 수 있음).
--
--   restore_digest는 되살아나는 Digest가 아직 extraction_status='pending'인
--   채로 archive됐다면(추출 완료 전에 아카이브된 경우), 그 사이 원문(source)의
--   추출 배치가 이 Digest 없이 완료되며 sources.extraction_status를 이미
--   completed로 닫았을 수 있다(워커의 fetchSourceDigests가 archived를 걸러내
--   므로) — 그대로 두면 이 Digest는 영원히 "처리 중"(isProcessing)에 갇힌다.
--   원문을 extraction_status·linking_status 둘 다 다시 pending으로 돌려
--   워커가 이 Digest를 다시 집고 그 결과가 링킹 단계까지 흘러가게 한다
--   (confirm_digest_edit·resolve_duplicate_relation과 같은 2컬럼 리셋 관용구).
-- =============================================================

CREATE FUNCTION restore_digest(p_digest_id uuid)
RETURNS uuid AS $$
DECLARE
  v_changeset_id      uuid;
  v_revert_id         uuid;
  v_source_id         uuid;
  v_extraction_status ingestion_status;
BEGIN
  SELECT source_id, extraction_status INTO v_source_id, v_extraction_status
  FROM digests
  WHERE id = p_digest_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'digest % is not an archived digest the caller can restore', p_digest_id
      USING ERRCODE = 'NM010';
  END IF;

  SELECT ch.changeset_id INTO v_changeset_id
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = 'digest' AND ch.target_id = p_digest_id AND ch.action = 'archive'
    AND cs.type IN ('manual', 'revert')
  ORDER BY ch.created_at DESC, ch.id DESC
  LIMIT 1;

  IF v_changeset_id IS NULL THEN
    RAISE EXCEPTION 'digest % has no archiving changeset to revert', p_digest_id
      USING ERRCODE = 'NM010';
  END IF;

  v_revert_id := revert_changeset(v_changeset_id);

  IF v_extraction_status = 'pending' THEN
    UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
    WHERE id = v_source_id;
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE FUNCTION restore_reference(p_reference_id uuid)
RETURNS uuid AS $$
DECLARE
  v_changeset_id uuid;
BEGIN
  PERFORM 1 FROM "references"
  WHERE id = p_reference_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an archived reference the caller can restore', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  SELECT ch.changeset_id INTO v_changeset_id
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = 'reference' AND ch.target_id = p_reference_id AND ch.action = 'archive'
    AND cs.type IN ('manual', 'revert')
  ORDER BY ch.created_at DESC, ch.id DESC
  LIMIT 1;

  IF v_changeset_id IS NULL THEN
    RAISE EXCEPTION 'reference % has no archiving changeset to revert', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  RETURN revert_changeset(v_changeset_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) revert_changeset — 멤버십 체크가 Reference용 manual changeset을
--    놓치던 버그 수정
--
--   changesets.space_id는 20260706113904부터 Reference 직접 수정(Workspace
--   스코프)을 위해 nullable인데, 이 함수의 가드는 그 이후로도 계속
--   is_space_member(space_id)만 봤다 — space_id가 NULL이면 SQL 특성상
--   `space_id = ...` 비교가 전부 unknown이라 is_space_member(NULL)은 언제나
--   false다. 즉 auth.uid()가 NULL인 service_role 경로만 통과하고, 실제
--   로그인 유저는 Reference manual changeset(update_reference·archive_reference·
--   이번에 추가한 restore_reference가 만드는 revert)을 전부 되돌릴 수 없었다
--   (restore_reference를 얹으며 발견 — 되돌리기 핵심 로직은 그대로 두고
--   이 가드 한 줄만 넓힌다. title/revert_depth 관련 변경 없음, 나머지 함수
--   본문은 20260721110000(revert_changeset_depth)의 최신 정의를 그대로
--   가져왔다 — 그 마이그레이션이 title 접미사 이어붙이기를 revert_depth
--   컬럼 방식으로 바꿔서, 이 파일이 그보다 나중 타임스탬프로 실행되지 않으면
--   이 멤버십 수정이 조용히 덮어써진다).
--
--   space_id가 NULL인 changeset은 change 행의 target_id로 Reference를
--   찾아 그 workspace_id로 멤버십을 판단한다 — changesets 테이블 자체엔
--   workspace_id가 없어 changes를 거쳐야 한다.
--
--   이 참에 이 함수(#467에서 넘어온 기존 코드)의 세 RAISE EXCEPTION에
--   ERRCODE도 붙인다 — 없으면 query_failed로 떨어져 "이미 되살린 걸 또
--   되살리기"(두 탭 동시 클릭 등, 정상적인 동시성 결과) 같은 흔한 레이스가
--   이 PR이 새로 여는 되살리기 진입점을 통해 스퓨리어스 500/Sentry로 샌다
--   — 이 PR의 목적(NM007/NM010 도입)과 정면으로 어긋나는 구멍이라 함께
--   막는다. "not found or not accessible"은 기존 not_found 버킷(P0002)을
--   그대로 쓰고, "already reverted"·"nothing to revert"는 changeset
--   자체의 상태 가드 실패라 엔티티 전용 코드(NM007/NM010)가 아닌 새 코드
--   NM011(changeset_state_changed)로 — NM004처럼 결이 같은 여러 상황을
--   한 코드로 묶는다.
-- =============================================================

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

  INSERT INTO changesets (space_id, type, status, reverts_id, author_id, title, revert_depth)
  VALUES (
    v_space_id, 'revert', 'applied', p_changeset_id, auth.uid(),
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

-- =============================================================
-- 4) 대상(Digest/Reference)별 수정 이력 조회
--
--   surface-inventory.md "변경 이력" 모달(좌측 diff, 우측 시각+수정자 목록,
--   changeset 번호·라벨은 안 보여줌) 설계 참고. changesets/changes의 RLS는
--   is_space_member(space_id)만 보는데, Reference manual changeset은
--   space_id가 NULL이라 위 revert_changeset과 같은 이유로 direct select가
--   막힌다 — RLS 정책 자체를 넓히는 대신(다른 소비처에 영향이 갈 블라스트
--   반경이라) get_reference_citing_digests와 같은 이유로 전용 RPC로
--   멤버십을 직접 검증한다.
--
--   manual뿐 아니라 revert도 함께 조회한다 — 이 모달의 목적이 "이 대상에게
--   무슨 일이 있었는지 추적"인데, manual만 보면 archive_digest/archive_reference·
--   confirm_digest_edit·update_reference가 만든 이력만 보이고 그걸 되돌린
--   revert_changeset(되살리기 포함)은 안 보인다 — 실제로는 active인 대상이
--   이력엔 "archived됨"만 남아 실제 상태와 화면이 어긋난다. revert changeset도
--   ch.target_id로 이미 좁혀져 있어(대상과 무관한 revert는 안 걸림) manual과
--   합쳐도 안전하다.
-- =============================================================

CREATE FUNCTION list_manual_changes_for_target(
  p_target_type change_target_type,
  p_target_id   uuid
)
RETURNS TABLE (
  id               uuid,
  changeset_id     uuid,
  changeset_number int,
  author_id        uuid,
  created_at       timestamptz,
  action           change_action,
  data             jsonb
) AS $$
BEGIN
  IF p_target_type = 'digest' THEN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM digests d WHERE d.id = p_target_id AND is_space_member(d.space_id)
    ) THEN
      RAISE EXCEPTION 'digest % not found or not accessible', p_target_id
        USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_target_type = 'reference' THEN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "references" r WHERE r.id = p_target_id AND is_workspace_member(r.workspace_id)
    ) THEN
      RAISE EXCEPTION 'reference % not found or not accessible', p_target_id
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'list_manual_changes_for_target only supports digest/reference targets (got %)', p_target_type;
  END IF;

  RETURN QUERY
  SELECT ch.id, ch.changeset_id, cs.number, cs.author_id, ch.created_at, ch.action, ch.data
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = p_target_type AND ch.target_id = p_target_id
    AND cs.type IN ('manual', 'revert')
  ORDER BY ch.created_at DESC, ch.id DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================
-- 5) 인덱스 — changes(target_type, target_id)
--
--   restore_digest·restore_reference·list_manual_changes_for_target 셋 다
--   target으로 조회하는데 기존 인덱스는 idx_changes_changeset(changeset_id)
--   하나뿐이라 이 조회들이 전부 seq scan을 탄다. changes는 진술 생성마다
--   커지는 테이블이라 미리 인덱스를 깐다(20260720120000과 같은 결).
-- =============================================================

CREATE INDEX idx_changes_target ON changes (target_type, target_id);

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION archive_digest(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_digest(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_digest(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_digest(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_reference(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_reference(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION list_manual_changes_for_target(change_target_type, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION list_manual_changes_for_target(change_target_type, uuid) TO authenticated, service_role;
