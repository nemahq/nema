-- =============================================================
-- 초안 관리 — Space 재지정 (케이스 "초안에서 Space 재지정")
--
-- 평범한 대기 상태(status='pending' AND digestion_status <> 'pending')인 원문만
-- 대상 — trash_source·start_source_digestion과 같은 가드 모양(액션 잠금과 일관).
-- 순수 메타데이터 이동이라 statements·statement_sources는 건드리지 않는다.
--
-- 멤버십은 양쪽 다 확인한다: 지금 Space뿐 아니라 옮겨갈 Space도 내가 속해 있어야
-- 한다 — 안 그러면 남의 Space로(혹은 남의 Space에서) 원문을 옮길 수 있게 된다.
-- =============================================================

CREATE FUNCTION reassign_source_space(p_source_id uuid, p_space_id uuid)
RETURNS void AS $$
BEGIN
  -- 대상 Space 접근권은 아래 상태 가드(NM004, "그 사이 상태가 바뀜")와 다른 종류의
  -- 거부라 별도 코드로 던진다. 같은 코드로 뭉치면 실제로는 접근권이 없는 시도인데도
  -- "초안 상태가 바뀌었으니 새로고침하라"는 엉뚱한 안내가 뜬다. 42501은 다른 RPC의
  -- insufficient_privilege 그대로라 error-mapper가 이미 "forbidden"으로 매핑한다.
  IF auth.uid() IS NOT NULL AND NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id
      USING ERRCODE = '42501';
  END IF;

  -- 확정 대기 중인 리뷰가 있으면 막는다(start_source_digestion과 같은 이유) —
  -- changesets.space_id는 옛 Space에 그대로 남으므로, Source만 옮기면 그 changeset이
  -- 나중에 확정될 때 멤버십 판정과 결과 Digest 생성이 옛 Space 기준으로 어긋난다.
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id
      AND c.type = 'ingestion'
      AND c.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE sources
  SET space_id = p_space_id
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle pending source the caller can reassign', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reassign_source_space(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION reassign_source_space(uuid, uuid) TO authenticated, service_role;
