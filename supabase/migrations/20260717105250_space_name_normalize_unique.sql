-- =============================================================
-- Space 이름 중복 검사 — 유니코드 정규화(NFC) 반영
--
-- 기존 lower(name) 인덱스는 대소문자만 무시하고 유니코드 정규화는 하지
-- 않았다. 같은 문자라도 결합형(NFD)과 완성형(NFC)으로 서로 다르게 인코딩된
-- 이름은 화면상 완전히 동일해 보이는데도 별개 이름으로 통과했다. lower와
-- normalize(NFC)를 함께 적용해 "눈에 보이는 대로 같으면 같은 이름"이 되도록
-- 맞춘다.
--
-- 표현식 UNIQUE는 ADD CONSTRAINT로 못 걸어 CREATE UNIQUE INDEX로 대체한다.
-- 인덱스 생성 전, 같은 워크스페이스 안에 lower(normalize(name, NFC))가 같은
-- 기존 행이 있으면(있을 가능성은 낮지만) 나중에 만들어진 쪽에 " (2)"류
-- 접미사를 붙여 충돌을 피한다 — 지우거나 합치지 않고 그대로 보존. id는
-- gen_random_uuid()라 생성 순서와 무관하므로, "나중"은 created_at으로
-- 판단한다(id는 동시각 tie-break용).
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
        AND lower(normalize(s2.name, NFC)) = lower(normalize(s.name, NFC))
        AND (s2.created_at, s2.id) < (s.created_at, s.id)
    )
    ORDER BY created_at, id
  LOOP
    v_suffix := 2;
    LOOP
      -- SPACE_NAME_MAX_LENGTH(packages/shared)를 넘지 않도록, 접미사 길이만큼
      -- 원래 이름을 잘라서 붙인다.
      v_candidate := left(v_dup.name, 50 - length(' (' || v_suffix || ')'))
        || ' (' || v_suffix || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM spaces
        WHERE workspace_id = v_dup.workspace_id
          AND lower(normalize(name, NFC)) = lower(normalize(v_candidate, NFC))
      );
      v_suffix := v_suffix + 1;
    END LOOP;
    UPDATE spaces SET name = v_candidate WHERE id = v_dup.id;
  END LOOP;
END $$;

DROP INDEX spaces_workspace_id_name_lower_key;
CREATE UNIQUE INDEX spaces_workspace_id_name_normalized_key
  ON spaces (workspace_id, lower(normalize(name, NFC)));

-- create_space / rename_space의 unique_violation → NM003 매핑을 새 인덱스
-- 이름 기준으로 갱신(나머지 본문은 20260715140000 시점 정의와 동일).

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
  IF v_constraint <> 'spaces_workspace_id_name_normalized_key' THEN RAISE; END IF;
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
  IF v_constraint <> 'spaces_workspace_id_name_normalized_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
