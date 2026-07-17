-- =============================================================
-- delete_space — 대기 중인 초안을 "이동" 대신 "함께 삭제"할 수 있는 옵션 추가
--
-- 직전 마이그레이션(20260715130000)은 대기 초안(pending, 열린 ingestion
-- changeset 없음)을 항상 다른 Space로 옮기도록 강제했다 — "손대지 않고 그대로
-- 박제"라는 Source의 원칙(07-modeling.md)상, Space 삭제의 부수효과로 아직
-- 아무도 검토 못 한 초안이 조용히 사라지면 안 된다는 판단이었다. 근데 이건
-- "보존"만 고려한 강제였고, 사용자가 Space 자체를 완전히 정리하고 싶은 경우
-- (실험용/취소된 프로젝트 Space 등)엔 그 초안이 다른 Space로 흘러들어가는 게
-- 오히려 원치 않는 결과다 — 두 니즈 다 타당하므로 암묵적으로 강제하지 않고
-- p_delete_pending_drafts로 명시적으로 고르게 한다.
--
-- "삭제" 선택 시 trash_source(단일 원본 휴지통행 — 07-modeling §완전 삭제)를
-- 거치는 30일 유예 경로를 타지 않는다. Space 삭제엔 애초에 Space 자신의
-- trashed 상태가 없어(07-modeling: "삭제가 필요해지면 그 안의 Space들에 이미
-- 있는 완전 삭제 캐스케이드를 부채꼴로 실행") active·리뷰 중인 초안도 이미
-- 유예 없이 즉시 cascade 삭제되고 있다 — 대기 초안만 다른 대우를 받을 이유가
-- 없다. 그냥 이동 UPDATE를 건너뛰면, 뒤이은 `DELETE FROM spaces`가 걔들도
-- 나머지와 똑같이 cascade로 쓸어간다.
--
-- 대기 초안 대부분은 파생물이 없지만, 되돌리기(active→pending)를 거친 소스는
-- 과거 changeset(applied)·archived Digest를 여전히 달고 있을 수 있다 — 이
-- cascade로 그것도 함께 지워진다. 새로운 위험은 아니다: 이 소스를 초안 탭에서
-- 개별 삭제해도 trash_source→30일 후 purge_expired_sources의 동일한
-- `DELETE FROM sources` cascade가 이미 똑같이 지운다. 여긴 같은 결과에 30일
-- 유예 없이 더 빨리 도달하는 것뿐이다.
-- =============================================================

-- 인자 개수가 늘어(2→3) CREATE OR REPLACE로 안 덮인다(오버로드로 취급돼 named
-- param 호출 시 후보가 갈려 에러) — 먼저 드롭한다.
DROP FUNCTION delete_space(uuid, uuid);

CREATE FUNCTION delete_space(
  p_space_id uuid,
  p_target_space_id uuid DEFAULT NULL,
  p_delete_pending_drafts boolean DEFAULT false
)
RETURNS void AS $$
DECLARE
  v_workspace_id  uuid;
  v_statement_ids uuid[];
  v_draft_ids     uuid[];
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM spaces
  WHERE id = p_space_id
    AND (auth.uid() IS NULL OR is_space_member(p_space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF (SELECT count(*) FROM spaces WHERE workspace_id = v_workspace_id) <= 1 THEN
    RAISE EXCEPTION 'workspace % must keep at least one space', v_workspace_id
      USING ERRCODE = 'NM002';
  END IF;

  -- 현재 클라이언트(FE select 하나에서 파생)는 절대 둘 다 안 보내지만, 이 RPC는
  -- authenticated 클라이언트가 직접 호출할 수 있는 표면이다 — 방어 없이 두면
  -- 미래의 다른 호출자가 둘 다 보냈을 때 target 검증을 통째로 건너뛰고 더
  -- 파괴적인 쪽(삭제)이 조용히 이긴다. 모호한 입력은 뭘 골랐는지 추측하지
  -- 않고 바로 거부한다.
  IF p_target_space_id IS NOT NULL AND p_delete_pending_drafts THEN
    RAISE EXCEPTION 'p_target_space_id and p_delete_pending_drafts are mutually exclusive';
  END IF;

  -- 여기서 배열로 미리 구체화해두고 이 값으로만 UPDATE한다 — pending_draft_source_ids(p_space_id)를
  -- UPDATE의 WHERE 서브쿼리로 직접 걸면(자기 참조: 둘 다 sources 대상), STABLE SQL
  -- 함수가 인라인되면서 Postgres가 조건에 안 맞는 행(active·리뷰 중인 pending)까지
  -- 매치해버리는 걸 직접 재현해 확인했다 — array_agg로 먼저 끊어야 안전하다.
  SELECT array_agg(x) INTO v_draft_ids
  FROM pending_draft_source_ids(p_space_id) AS x;

  -- p_delete_pending_drafts=true면 이동 분기 전체를 건너뛴다 — 대기 초안은
  -- space_id를 그대로 유지한 채 아래 `DELETE FROM spaces`의 cascade에 맡겨진다.
  IF v_draft_ids IS NOT NULL AND NOT p_delete_pending_drafts THEN
    IF p_target_space_id IS NULL THEN
      -- 클라이언트가 항상 미리 count_pending_drafts로 계산해서 이동/삭제 중
      -- 하나를 명시적으로 넘기므로 정상 경로에선 안 뜬다 — 그 사이(폴링 텀 등)
      -- 대기 초안이 새로 생긴 경쟁 상태 대비 방어 가드. NM002와 같은 결(정상적인
      -- 사용자 유도)이라 별도 코드(NM009)로 분리해 Sentry로 안 올라가게 한다.
      RAISE EXCEPTION 'space % has % pending draft(s); p_target_space_id or p_delete_pending_drafts is required',
        p_space_id, array_length(v_draft_ids, 1)
        USING ERRCODE = 'NM009';
    END IF;

    IF p_target_space_id = p_space_id OR NOT EXISTS (
      SELECT 1 FROM spaces WHERE id = p_target_space_id AND workspace_id = v_workspace_id
    ) THEN
      RAISE EXCEPTION 'target space % is not a valid destination in workspace % (must be a different space in the same workspace)',
        p_target_space_id, v_workspace_id
        USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE sources SET space_id = p_target_space_id
    WHERE id = ANY(v_draft_ids);
  END IF;

  SELECT array_agg(id) INTO v_statement_ids
  FROM statements WHERE space_id = p_space_id;

  IF v_statement_ids IS NOT NULL THEN
    PERFORM pgmq.send('vector_purge',
      jsonb_build_object('statement_ids', to_jsonb(v_statement_ids)));
  END IF;

  DELETE FROM spaces WHERE id = p_space_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION delete_space(uuid, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_space(uuid, uuid, boolean) TO authenticated, service_role;
