-- =============================================================
-- 초안 관리 — Space 재지정 (케이스 "초안에서 Space 재지정")
--
-- 평범한 대기 상태(status='pending' AND digestion_status <> 'pending')인 원본만
-- 대상 — trash_source·start_source_digestion과 같은 가드 모양(액션 잠금과 일관).
-- 순수 메타데이터 이동이라 statements·statement_sources는 건드리지 않는다.
--
-- 멤버십은 양쪽 다 확인한다: 지금 Space뿐 아니라 옮겨갈 Space도 내가 속해 있어야
-- 한다 — 안 그러면 남의 Space로(혹은 남의 Space에서) 원본을 옮길 수 있게 된다.
-- =============================================================

CREATE FUNCTION reassign_source_space(p_source_id uuid, p_space_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET space_id = p_space_id
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
    AND (auth.uid() IS NULL OR is_space_member(p_space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle pending source the caller can reassign to space %', p_source_id, p_space_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reassign_source_space(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION reassign_source_space(uuid, uuid) TO authenticated, service_role;
