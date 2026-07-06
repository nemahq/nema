-- =============================================================
-- 용어 사전 v2 모델링: Source 상태 v2 전환 (07-modeling.md)
--
-- active/archived → pending/active/trashed. 전이는 한 방향 사슬:
--   active ─(ingestion 되돌리기)→ pending ─(삭제)→ trashed ─(보관 기간)→ 완전 삭제
--   (복원: trashed → pending. 파생이 없는 상태라 pending 정의에 부합)
--
-- 기존 archived 행은 pending으로 — archived로 가는 경로가 되돌리기였고,
-- v2의 pending 정의("원본 빼기로 되돌려진 것")가 정확히 그 상태다.
-- 신규 기본값은 당분간 active 유지 — pending→active 승격 게이트(Digest 확정)가
-- 생기는 인테이크 개편에서 기본값을 pending으로 전환한다.
--
-- "active에서 원본만 빼기"(파생 유지한 채 숨김)는 v2에 없는 동작이라
-- archive_source RPC를 제거한다. trashed 진입은 pending에서만(trash_source).
-- 삭제·복원은 변경이력에 남기지 않는다 — pending 원본은 아직 그래프에 아무것도
-- 심지 않아 지킬 판단·관계가 없다(리뷰·되돌리기의 대상이 아님).
-- =============================================================

-- =============================================================
-- 1) enum 재구성 + 기존 행 매핑 (archived → pending)
-- =============================================================

ALTER TYPE source_status RENAME TO source_status_old;
CREATE TYPE source_status AS ENUM ('pending', 'active', 'trashed');

ALTER TABLE sources ALTER COLUMN status DROP DEFAULT;
ALTER TABLE sources ALTER COLUMN status TYPE source_status
  USING (CASE status::text WHEN 'archived' THEN 'pending' ELSE status::text END)::source_status;
ALTER TABLE sources ALTER COLUMN status SET DEFAULT 'active';

DROP TYPE source_status_old;

-- =============================================================
-- 2) trashed_at — 완전 삭제 배치가 보관 기간(30일) 경과를 판단하는 기준
-- =============================================================

ALTER TABLE sources ADD COLUMN trashed_at timestamptz;

-- trashed면 반드시 시각이 있고, 아니면 반드시 없다
ALTER TABLE sources ADD CONSTRAINT chk_trashed_at_iff_trashed CHECK (
  (status = 'trashed') = (trashed_at IS NOT NULL)
);

-- =============================================================
-- 3) archive_source 제거 — v2에 자리가 없는 동작
-- =============================================================

DROP FUNCTION archive_source(uuid);

-- =============================================================
-- 4) revert_changeset — 원본 전이만 v2로 교체 (archived ↔ active → pending ↔ active)
--    나머지 로직은 20260615115646과 동일.
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
      ELSE  -- source: v2에서 "빼기"의 도착지는 pending
        UPDATE sources SET status = 'pending'
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

-- =============================================================
-- 5) 휴지통 넣기/꺼내기 — trashed 진입·복귀의 유일한 경로
--    변경셋 없음: pending 원본은 그래프 밖이라 이력의 대상이 아니다.
-- =============================================================

CREATE OR REPLACE FUNCTION trash_source(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- 삭제는 pending에서만 — active 원본은 되돌리기로 pending을 거쳐야 한다
  UPDATE sources
  SET status = 'trashed', trashed_at = now()
  WHERE id = p_source_id AND status = 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not a pending source the caller can trash', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION restore_trashed_source(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- 복원 도착지는 pending — 파생이 없는 상태라 pending 정의 그대로
  UPDATE sources
  SET status = 'pending', trashed_at = NULL
  WHERE id = p_source_id AND status = 'trashed'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not a trashed source the caller can restore', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION trash_source FROM public, anon;
GRANT EXECUTE ON FUNCTION trash_source TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_trashed_source FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_trashed_source TO authenticated, service_role;
