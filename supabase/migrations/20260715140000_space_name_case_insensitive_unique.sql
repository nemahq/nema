-- =============================================================
-- Space 이름 중복 검사 — 대소문자 무시로 전환
--
-- 기존 UNIQUE(workspace_id, name)은 대소문자를 구분해 "My Space"와
-- "my space"가 같은 워크스페이스에 동시에 존재할 수 있었다. LNB처럼 이름만
-- 보고 고르는 짧은 목록에서는 사실상 의도치 않은 거의-중복으로 보일 가능성이
-- 높아(대부분 오타·습관적 표기 차이지 "진짜 다른 두 개"를 의도한 경우는
-- 드묾) 대소문자 무시로 바꾼다 — 계정 삭제 확인 이메일 비교(design-decisions-
-- log.md)와 같은 이유: 실사용에서 대소문자 구분이 오히려 마찰만 만든다.
--
-- 표현식 UNIQUE는 ADD CONSTRAINT로 못 걸어 CREATE UNIQUE INDEX로 대체한다.
-- 인덱스 생성 전, 같은 워크스페이스 안에 lower(name)이 같은 기존 행이 있으면
-- (있을 가능성은 낮지만) 나중에 만들어진 쪽에 " (2)"류 접미사를 붙여 충돌을
-- 피한다 — 지우거나 합치지 않고 그대로 보존.
-- =============================================================

DO $$
DECLARE
  v_dup       record;
  v_suffix    int;
  v_candidate text;
BEGIN
  FOR v_dup IN
    SELECT id, workspace_id, name
    FROM spaces s
    WHERE EXISTS (
      SELECT 1 FROM spaces s2
      WHERE s2.workspace_id = s.workspace_id
        AND lower(s2.name) = lower(s.name)
        AND s2.id < s.id
    )
    ORDER BY id
  LOOP
    v_suffix := 2;
    LOOP
      v_candidate := v_dup.name || ' (' || v_suffix || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM spaces
        WHERE workspace_id = v_dup.workspace_id AND lower(name) = lower(v_candidate)
      );
      v_suffix := v_suffix + 1;
    END LOOP;
    UPDATE spaces SET name = v_candidate WHERE id = v_dup.id;
  END LOOP;
END $$;

ALTER TABLE spaces DROP CONSTRAINT spaces_workspace_id_name_key;
CREATE UNIQUE INDEX spaces_workspace_id_name_lower_key ON spaces (workspace_id, lower(name));

-- create_space / rename_space의 unique_violation → NM003 매핑을 새 인덱스
-- 이름 기준으로 갱신(나머지 본문은 20260713062947 시점 정의와 동일).

CREATE OR REPLACE FUNCTION create_space(p_workspace_id uuid, p_name text, p_public_id text)
RETURNS uuid AS $$
DECLARE
  v_space_id   uuid;
  v_constraint text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % is not accessible to the caller', p_workspace_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO spaces (workspace_id, name, public_id)
  VALUES (p_workspace_id, btrim(p_name), p_public_id)
  RETURNING id INTO v_space_id;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, auth.uid(), 'owner');
  END IF;

  RETURN v_space_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'spaces_workspace_id_name_lower_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION rename_space(p_space_id uuid, p_name text)
RETURNS void AS $$
DECLARE
  v_constraint text;
BEGIN
  UPDATE spaces
  SET name = btrim(p_name)
  WHERE id = p_space_id
    AND (auth.uid() IS NULL OR is_space_member(p_space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'space % is not accessible to the caller', p_space_id
      USING ERRCODE = 'no_data_found';
  END IF;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'spaces_workspace_id_name_lower_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
