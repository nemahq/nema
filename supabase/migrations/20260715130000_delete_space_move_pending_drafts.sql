-- =============================================================
-- delete_space — 삭제 대상 Space의 대기 중인 초안을 다른 Space로 옮긴 뒤 삭제
--
-- 기존엔 spaces 삭제 하나로 sources까지 FK cascade로 통째로 날아갔다. 이미
-- 다이제스천 끝나 그래프(Digest·Statement)에 심어진 active 원본은 "Space 삭제 =
-- 콘텐츠 영구 삭제"라는 기존 의도대로 그대로 cascade 삭제하는 게 맞지만, 아직
-- 리뷰에도 안 들어간 대기 중인 초안(status='pending', 열린 ingestion changeset
-- 없음 — /drafts 화면에 뜨는 것과 정확히 같은 집합)은 사용자가 되찾을 방법이
-- 없이 조용히 사라지는 게 문제였다. 이 초안들만 골라 삭제 전에 다른 Space로
-- 옮긴다.
--
-- p_target_space_id는 옮길 초안이 있을 때만 필수 — 없으면(초안이 없거나 이미
-- 지정돼 있으면) 무시된다. 대상 검증은 "같은 워크스페이스의 다른 Space"까지만—
-- 멤버십 자체는 delete_space 진입 시 이미 is_space_member로 확인된 워크스페이스
-- 안이라 별도 권한 체크가 불필요하다.
-- =============================================================

-- 기존 1-param 시그니처는 CREATE OR REPLACE로 안 덮인다(오버로드로 취급돼
-- 둘 다 남으면 1개짜리 인자로 호출 시 후보가 갈려 에러) — 먼저 드롭한다.
DROP FUNCTION delete_space(uuid);

CREATE FUNCTION delete_space(p_space_id uuid, p_target_space_id uuid DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_workspace_id  uuid;
  v_statement_ids uuid[];
  v_draft_count   int;
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

  SELECT count(*) INTO v_draft_count
  FROM sources
  WHERE space_id = p_space_id
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM changesets
      WHERE changesets.source_id = sources.id
        AND changesets.type = 'ingestion'
        AND changesets.status = 'pending'
    );

  IF v_draft_count > 0 THEN
    IF p_target_space_id IS NULL THEN
      RAISE EXCEPTION 'space % has % pending draft(s); p_target_space_id is required',
        p_space_id, v_draft_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM spaces WHERE id = p_target_space_id AND workspace_id = v_workspace_id
    ) THEN
      RAISE EXCEPTION 'target space % is not in workspace %', p_target_space_id, v_workspace_id
        USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE sources SET space_id = p_target_space_id
    WHERE space_id = p_space_id
      AND status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM changesets
        WHERE changesets.source_id = sources.id
          AND changesets.type = 'ingestion'
          AND changesets.status = 'pending'
      );
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
