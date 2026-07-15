-- =============================================================
-- delete_space — 삭제 대상 Space의 대기 중인 초안을 다른 Space로 옮긴 뒤 삭제
--
-- 기존엔 spaces 삭제 하나로 sources까지 FK cascade로 통째로 날아갔다. cascade
-- 대상은 원래 두 갈래였다: (1) 이미 다이제스천 끝나 그래프(Digest·Statement)에
-- 심어진 active 원본, (2) 이미 Digest Review에 들어간(열린 ingestion changeset이
-- 있는) pending 원본 — 이 PR은 이 둘의 "Space 삭제 = 콘텐츠 영구 삭제" 취급은
-- 그대로 두고, 세 번째 갈래인 아직 리뷰에도 안 들어간 대기 중인 초안
-- (status='pending', 열린 ingestion changeset 없음 — /drafts 화면에 뜨는 것과
-- 정확히 같은 집합)만 골라 삭제 전에 다른 Space로 옮긴다. 이 초안은 그래프에
-- 아무 흔적도 안 남긴 상태라, 그대로 cascade에 맡기면 사용자가 되찾을 방법이
-- 없이 조용히 사라진다.
--
-- p_target_space_id는 옮길 초안이 있을 때만 필수 — 초안이 없으면 값을 넘겨도
-- 그냥 안 쓰인다. 대상 검증은 "같은 워크스페이스의, 삭제 대상과 다른 Space"
-- 인지까지 확인한다(멤버십 자체는 delete_space 진입 시 이미 is_space_member로
-- 확인된 워크스페이스 안이라 별도 권한 체크가 불필요하다).
-- =============================================================

-- 옮길 초안 판별 조건을 delete_space(카운트·이동)와 count_pending_drafts(조회)
-- 양쪽이 공유 — 조건이 두 곳에 따로 박히면 나중에 한쪽만 고쳐서 어긋날 수 있다.
-- 외부에서 직접 부르라고 만든 게 아니라 REVOKE로 막아둔다(호출부는 전부
-- SECURITY DEFINER 함수 안이라 소유자 권한으로 계속 호출 가능).
CREATE FUNCTION pending_draft_source_ids(p_space_id uuid)
RETURNS SETOF uuid AS $$
  SELECT id FROM sources
  WHERE space_id = p_space_id
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM changesets
      WHERE changesets.source_id = sources.id
        AND changesets.type = 'ingestion'
        AND changesets.status = 'pending'
    );
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION pending_draft_source_ids(uuid) FROM public, anon, authenticated;

-- 기존 1-param 시그니처는 CREATE OR REPLACE로 안 덮인다(오버로드로 취급돼
-- 둘 다 남으면 1개짜리 인자로 호출 시 후보가 갈려 에러) — 먼저 드롭한다.
DROP FUNCTION delete_space(uuid);

CREATE FUNCTION delete_space(p_space_id uuid, p_target_space_id uuid DEFAULT NULL)
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

  -- 여기서 배열로 미리 구체화해두고 이 값으로만 UPDATE한다 — pending_draft_source_ids(p_space_id)를
  -- UPDATE의 WHERE 서브쿼리로 직접 걸면(자기 참조: 둘 다 sources 대상), STABLE SQL
  -- 함수가 인라인되면서 Postgres가 조건에 안 맞는 행(active·리뷰 중인 pending)까지
  -- 매치해버리는 걸 직접 재현해 확인했다 — array_agg로 먼저 끊어야 안전하다.
  SELECT array_agg(x) INTO v_draft_ids
  FROM pending_draft_source_ids(p_space_id) AS x;

  IF v_draft_ids IS NOT NULL THEN
    IF p_target_space_id IS NULL THEN
      -- 클라이언트가 항상 미리 count_pending_drafts로 계산해서 넘기므로 정상
      -- 경로에선 안 뜬다 — 그 사이(폴링 텀 등) 대기 초안이 새로 생긴 경쟁
      -- 상태 대비 방어 가드. NM002와 같은 결(정상적인 사용자 유도)이라 별도
      -- 코드(NM009)로 분리해 Sentry로 안 올라가게 한다.
      RAISE EXCEPTION 'space % has % pending draft(s); p_target_space_id is required',
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

REVOKE ALL ON FUNCTION delete_space(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_space(uuid, uuid) TO authenticated, service_role;

-- =============================================================
-- count_pending_drafts — 삭제 확인 UI가 "옮길 초안이 몇 개인지" 미리 보여주는 용도.
-- listPendingSources(source.listPending)는 워크스페이스 전체를 최근 50개로 자르므로
-- 특정 Space의 정확한 개수 판정엔 못 쓴다 — Space 스코프로 별도 카운트한다.
-- =============================================================

CREATE FUNCTION count_pending_drafts(p_space_id uuid)
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT (auth.uid() IS NULL OR is_space_member(p_space_id)) THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_count FROM pending_draft_source_ids(p_space_id);
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION count_pending_drafts(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION count_pending_drafts(uuid) TO authenticated, service_role;
