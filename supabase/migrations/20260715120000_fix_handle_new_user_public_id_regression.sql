-- =============================================================
-- handle_new_user() 회귀 수정 — 20260715110000이 public_id 로직을 지워버린 문제
--
-- 20260715110000(기본 Space 이름 소문자 정정)이 handle_new_user()를
-- CREATE OR REPLACE로 다시 쓰면서, 20260713062947(space_public_id)에서 추가된
-- public_id 생성 로직 없이 더 오래된 버전(20260712230000)의 함수 본문을
-- 그대로 복붙했다. spaces.public_id는 DEFAULT 없는 NOT NULL 컬럼이라, 그
-- 이후 모든 신규 가입이 트리거 안에서 NOT NULL 위반으로 100% 실패했다
-- (GoTrue가 "Database error saving new user"로 뭉뚱그려 반환).
--
-- 20260713062947의 public_id 생성 로직(generate_space_public_id() + 5회
-- 충돌 재시도)을 그대로 복원하고, 20260715110000이 의도했던 "My space"
-- 소문자 표기만 반영한다.
-- =============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
  v_public_id    text;
  v_attempt      int;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');

  FOR v_attempt IN 1..5 LOOP
    v_public_id := generate_space_public_id();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM spaces WHERE public_id = v_public_id);
  END LOOP;

  INSERT INTO spaces (name, workspace_id, public_id)
  VALUES ('My space', v_workspace_id, v_public_id)
  RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
