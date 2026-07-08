-- =============================================================
-- revert_changeset — digest·reference target_type 미처리 gap 수정
--
-- 20260706112433의 역연산 루프는 statement/relation/source 세 타입만 분기하고,
-- 그 외(digest·reference)는 source의 ELSE 분기로 떨어져 target_id가 sources 테이블에
-- 없으니 IF NOT FOUND CONTINUE로 조용히 아무 일도 안 했다 — 확정 원본을 되돌려도
-- 그 원본이 만든 Digest·Reference가 active로 남는 고아 gap (#361 handoff에서 지적).
--
-- Digest: 원본 1개 소유(source_id NOT NULL, 재사용 없음)라 create↔archive/restore를
--   대칭으로 안전하게 처리한다 — ingestion이 만든 Digest, confirm_digest_edit의 새
--   Digest·archive된 옛 Digest 전부 이 규칙 하나로 닫힌다.
-- Reference: Workspace 전체가 재사용하는 공유 자원 — 07-modeling §열어두는 것이 명시한
--   미해결 위험대로, 이 changeset이 "만들었다"는 이유만으로 archive하면 다른 Digest가
--   그 뒤 계속 인용 중인 Reference를 감추게 된다(purge에서 Reference를 보존하기로 한
--   것과 같은 근거). 그래서 create→archive 방향은 건너뛰고, archive→restore(사람이
--   archive_reference로 정리한 걸 되돌리는 것)만 처리한다 — 이건 공유 여부와 무관하게
--   안전하다(정리 자체를 취소하는 것뿐).
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

    -- Reference의 create→archive 방향은 건너뛴다(공유 자원 보호, 위 설명 참조).
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
    -- 전이 대상이 그 시점 하나도 없었다 → 빈 revert 변경셋을 남기지 않는다.
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id;
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;
