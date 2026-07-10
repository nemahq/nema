-- =============================================================
-- Space 관리 — CRUD 계약 (07-modeling.md, nema-space-management-slice-draft.md)
--
-- 지금까지 spaces.name은 nullable이었다(가입 트리거가 NULL로 만들고, bootstrap이
-- 표시용 "Default" placeholder를 그때그때 채워 내려줬을 뿐 — 515df52 참고). 이번에
-- 실제 rename 뮤테이션이 생기며 이름을 NOT NULL + 빈 문자열 금지 +
-- UNIQUE(workspace_id, name)로 승격한다(topics·tags와 같은 패턴). 기존 NULL은 그
-- placeholder로 백필하고, 가입 트리거도 이제 NULL 대신 그 문자열을 직접 심는다.
-- shared의 DEFAULT_SPACE_NAME과 반드시 같은 값으로 유지할 것.
-- =============================================================

UPDATE spaces SET name = 'Default' WHERE name IS NULL;

ALTER TABLE spaces ALTER COLUMN name SET NOT NULL;
ALTER TABLE spaces ADD CONSTRAINT spaces_name_not_blank CHECK (btrim(name) <> '');
ALTER TABLE spaces ADD CONSTRAINT spaces_workspace_id_name_key UNIQUE (workspace_id, name);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');
  INSERT INTO spaces (name, workspace_id) VALUES ('Default', v_workspace_id) RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 1) create_space — 새 Space 생성 + 만든 사람을 owner로 등록
--
--   spaces_workspace_id_name_key 위반만 사용자 메시지로 옮긴다(다른 unique 제약이
--   나중에 생겨도 무관한 위반을 "이름 중복"으로 오보하지 않게 제약 이름에 고정 —
--   create_tag와 같은 결). NM003으로 다시 던져 error-mapper가 "이미 사용 중" 문구로
--   잇는다(원본 23505 그대로 두면 향후 다른 unique 위반과 코드를 공유하게 된다).
-- =============================================================

CREATE FUNCTION create_space(p_workspace_id uuid, p_name text)
RETURNS uuid AS $$
DECLARE
  v_space_id   uuid;
  v_constraint text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % is not accessible to the caller', p_workspace_id;
  END IF;

  INSERT INTO spaces (workspace_id, name) VALUES (p_workspace_id, btrim(p_name))
  RETURNING id INTO v_space_id;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, auth.uid(), 'owner');
  END IF;

  RETURN v_space_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'spaces_workspace_id_name_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) rename_space — 이름 변경 (검증·중복 처리는 create_space와 같은 결)
-- =============================================================

CREATE FUNCTION rename_space(p_space_id uuid, p_name text)
RETURNS void AS $$
DECLARE
  v_constraint text;
BEGIN
  UPDATE spaces
  SET name = btrim(p_name)
  WHERE id = p_space_id
    AND (auth.uid() IS NULL OR is_space_member(p_space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id;
  END IF;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'spaces_workspace_id_name_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) delete_space — min-1 강제 + Source purge와 같은 결의 완전 삭제 캐스케이드
--
--   min-1: 워크스페이스의 마지막 Space면 거부한다(NM002) — B가 "첫 방문 도장" 방식을
--   택하며 bootstrap의 "Space 0개면 자동생성" 안전망이 사라졌으므로, 마지막 Space를
--   지우면 회복 불가 dead-end가 된다(슬라이스 초안 "적용된 결정" 참고).
--
--   캐스케이드: spaces 삭제 하나로 delete_workspace와 같은 FK 체인(source·digest·
--   statement·statement_relation·space 스코프 changeset·topic·draft·space_member)이
--   자동으로 딸려 지워진다. Reference는 Workspace 공유 자원이라 이 체인에 없다(07-
--   modeling.md "완전 삭제" — 여러 Space가 인용할 수 있어 Space 하나 삭제로 못 지움).
--   진술 hard delete로 고아 남는 Qdrant 임베딩은 vector_purge 큐로 넘겨 워커가 정리.
-- =============================================================

CREATE FUNCTION delete_space(p_space_id uuid)
RETURNS void AS $$
DECLARE
  v_workspace_id  uuid;
  v_statement_ids uuid[];
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM spaces
  WHERE id = p_space_id
    AND (auth.uid() IS NULL OR is_space_member(p_space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id;
  END IF;

  IF (SELECT count(*) FROM spaces WHERE workspace_id = v_workspace_id) <= 1 THEN
    RAISE EXCEPTION 'workspace % must keep at least one space', v_workspace_id
      USING ERRCODE = 'NM002';
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

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION create_space(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_space(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION rename_space(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION rename_space(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION delete_space(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_space(uuid) TO authenticated, service_role;
