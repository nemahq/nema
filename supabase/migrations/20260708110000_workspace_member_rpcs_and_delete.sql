-- =============================================================
-- 워크스페이스 멤버 쓰기 계약 + 계정 삭제용 완전 삭제 캐스케이드 (07-modeling.md)
--
-- #347이 남긴 갭: enforce_workspace_owner_exists는 "마지막 owner가 남아있는 사람"의
-- 이탈·강등만 막고, 계정 삭제(auth.users 캐스케이드)는 일부러 통과시킨다 — 소유권
-- 이전 강제는 앱 레이어(계정 삭제 흐름)의 몫이라 미뤄뒀다. 이 마이그레이션은 그
-- 앱 레이어가 쓰는 쓰기 계약을 깐다:
--   1) update_workspace_member_role — 역할 변경(소유권 이전 = 멤버를 owner로 승격)
--   2) leave_workspace              — 나가기 (마지막 owner는 기존 트리거가 막음)
--   3) delete_workspace             — Workspace 완전 삭제 (계정 삭제의 유일-멤버 정리)
--
-- 직접 쓰기는 #349 RLS가 SELECT-only라 이미 막혀 있다 — 이 RPC들만 경유(SECURITY
-- DEFINER). 1)2)는 사용자 경로(authenticated, 멤버십·소유권 검증) + 운영자
-- (service_role, auth.uid NULL 통과). 3)은 파괴적이라 service_role 전용
-- (purge_expired_sources와 같은 계약) — 호출 전 유일-멤버 검증은 계정 삭제 서비스가 한다.
-- =============================================================

-- =============================================================
-- 1) update_workspace_member_role — 역할 변경 (소유권 이전 포함)
--
--   owner만 역할을 바꾼다. 마지막 owner를 member로 강등하는 시도는
--   enforce_workspace_owner_exists 트리거가 막는다("먼저 소유권을 넘겨라").
--   소유권 이전은 다른 멤버를 owner로 올리는 것 — 그 뒤 자신을 member로 내리는
--   건 두 번째 호출이며, 마지막 owner가 아니게 됐으므로 트리거를 통과한다.
-- =============================================================

CREATE FUNCTION update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_role         workspace_role
)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'only a workspace owner can change member roles';
  END IF;

  UPDATE workspace_members
  SET role = p_role
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % is not a member of workspace %', p_user_id, p_workspace_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) leave_workspace — 나가기
--
--   자신의 멤버십 행만 지운다(auth.uid 기준이라 운영자 경로는 무대상). 마지막
--   owner의 이탈은 트리거가 막아 "소유권 먼저 이전"을 강제한다 — 비-owner이거나
--   다른 owner가 있으면 그냥 나간다(07-modeling 동작 규칙).
-- =============================================================

CREATE FUNCTION leave_workspace(p_workspace_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of workspace %', p_workspace_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) delete_workspace — Workspace 완전 삭제 캐스케이드
--
--   07-modeling §Workspace: "그 안의 Space들에 이미 있는 완전 삭제 캐스케이드를
--   부채꼴로 실행하고, 다 비면 Workspace 자체를 제거한다". source purge 엔진을
--   Workspace 스코프로 편 것 — 계정 삭제 시 유일-멤버 워크스페이스가 owner·member
--   0명 고아로 남지 않게 통째로 지운다.
--
--   삭제 그물:
--     - spaces 삭제 → space_id ON DELETE CASCADE로 sources·digests·statements·
--       statement_relations·space 스코프 changesets·topics·drafts·space_members 동반.
--     - workspaces 삭제 → workspace_id ON DELETE CASCADE로 references·tags·
--       workspace_members 동반. (spaces.workspace_id는 NO ACTION이라 스페이스를
--       반드시 먼저 지워야 워크스페이스 삭제가 튕기지 않는다.)
--
--   두 그물이 놓치는 하나: Reference 수동 수정 manual changeset은 space_id가 NULL
--   (Workspace 스코프 콘텐츠 대상, changeset_model_v2 §4)이라 space 삭제에 안
--   걸린다. 이 워크스페이스의 Reference를 대상으로 한 것을 먼저 지운다(changes는
--   changeset_id CASCADE로 함께). references가 아직 살아 있을 때(아래 spaces·
--   workspaces 삭제 전) 조인해야 target_id로 도달한다.
--
--   벡터 정리: 진술 hard delete는 Qdrant 임베딩을 고아로 남긴다 — purge와 같은
--   계약으로 지울 진술 id를 삭제 전 vector_purge에 예약하고 워커가 드레인한다
--   (Reference는 임베딩 대상이 아니라 벡터 정리가 없다).
-- =============================================================

CREATE FUNCTION delete_workspace(p_workspace_id uuid)
RETURNS void AS $$
DECLARE
  v_statement_ids uuid[];
BEGIN
  SELECT array_agg(st.id) INTO v_statement_ids
  FROM statements st
  JOIN spaces sp ON sp.id = st.space_id
  WHERE sp.workspace_id = p_workspace_id;

  IF v_statement_ids IS NOT NULL THEN
    PERFORM pgmq.send('vector_purge',
      jsonb_build_object('statement_ids', to_jsonb(v_statement_ids)));
  END IF;

  DELETE FROM changesets c
  WHERE c.space_id IS NULL
    AND EXISTS (
      SELECT 1 FROM changes ch
      JOIN "references" r ON r.id = ch.target_id
      WHERE ch.changeset_id = c.id
        AND ch.target_type = 'reference'
        AND r.workspace_id = p_workspace_id
    );

  DELETE FROM spaces WHERE workspace_id = p_workspace_id;
  DELETE FROM workspaces WHERE id = p_workspace_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role).
-- delete_workspace는 파괴적이라 service_role 전용(purge_expired_sources와 같은 계약).
-- =============================================================

REVOKE ALL ON FUNCTION update_workspace_member_role(uuid, uuid, workspace_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_workspace_member_role(uuid, uuid, workspace_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION leave_workspace(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION leave_workspace(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION delete_workspace(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_workspace(uuid) TO service_role;
