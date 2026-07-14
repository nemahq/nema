-- =============================================================
-- Digest 리뷰 버리기·되살리기 (07-modeling.md, review-flow.md)
--
-- confirm_ingestion_review(적용)은 이미 있다. 남은 건 버리기(closed+discarded)와
-- 되살리기(discarded→open, 새 changeset 안 만듦) 둘 뿐 — 되돌리기(적용된 걸 되돌림)는
-- 기존 revert_changeset이 이미 커버한다(ingestion 타입도 이미 처리, changeset-router.ts).
--
-- 현재 스키마엔 07-modeling.md가 그리는 status(open/closed)+outcome(applied/discarded)
-- 두 필드 모델이 아직 없다 — changeset_status는 여전히 pending/applied/rejected 셋뿐
-- (reject_pending_relation, 20260615115646). "적용 안 하고 닫혔다"는 뜻을 relation은
-- 이미 rejected로 표현하고 있으므로, ingestion도 같은 값을 그대로 재사용한다(같은 상태를
-- 가리키는 두 번째 이름을 만들지 않는다) — status 재모델링은 이번 슬라이스 밖.
-- =============================================================

-- =============================================================
-- 1) discard_ingestion_review — 버리기 (pending → rejected)
--
--   confirm_ingestion_review와 같은 가드(type='ingestion' AND status='pending').
--   changes를 하나도 적용하지 않는다 — Digest·Reference를 안 만든다. 원본은 리뷰
--   내내 pending이라(create_ingestion_review 참고) 옮길 것도 없지만, 그 불변식이
--   깨진 경우까지 조용히 덮지 않도록 명시적으로 재확인한다(pending일 때만 손댐).
-- =============================================================

CREATE FUNCTION discard_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id  uuid;
  v_source_id uuid;
  v_status    changeset_status;
  v_type      changeset_type;
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
  IF v_type <> 'ingestion' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review the caller can discard', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE sources SET status = 'pending'
  WHERE id = v_source_id AND status = 'pending';

  UPDATE changesets SET status = 'rejected' WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) restore_ingestion_review — 되살리기 (rejected → pending, in-place)
--
--   새 changeset을 안 만들고 같은 changeset을 되돌린다 — revert_changeset의
--   append-only 되돌리기(applied 대상)와는 다른 메커니즘이다(discard는 changes를
--   하나도 안 만들어서 되돌릴 changes 자체가 없다, 07-modeling.md "버려짐 되살리기").
--   원본이 여전히 pending이어야만 가능 — "원본도 삭제하기"(trash_source)로 이미
--   trashed가 됐으면 그 조건이 깨져 거절한다(휴지통 복원은 restore_trashed_source 몫).
-- =============================================================

CREATE FUNCTION restore_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id  uuid;
  v_source_id uuid;
  v_status    changeset_status;
  v_type      changeset_type;
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
  IF v_type <> 'ingestion' OR v_status <> 'rejected' THEN
    RAISE EXCEPTION 'changeset % is not a discarded ingestion review the caller can restore', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'pending') THEN
    RAISE EXCEPTION 'source % is not pending — cannot restore a review over a trashed source', v_source_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE changesets SET status = 'pending' WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION discard_ingestion_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION discard_ingestion_review(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_ingestion_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_ingestion_review(uuid) TO authenticated, service_role;
