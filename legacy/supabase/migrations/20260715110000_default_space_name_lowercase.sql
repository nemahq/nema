-- =============================================================
-- 가입 시 자동 생성되는 기본 Space 이름 표기를 "My Space"에서 "My space"로
-- 소문자 s로 교체(20260712230000의 후속 정정, 같은 이유·같은 패턴).
--
-- 아직 "My Space" 그대로인 기존 Space도 20260712230000과 같은 로직으로
-- 함께 백필한다 — UNIQUE(workspace_id, name) 제약과 부딪힐 수 있어(유저가
-- 이미 "My space"라는 이름을 직접 지었을 수 있음) 대상 이름이 그 워크스페이스에
-- 없을 때만 백필한다.
-- =============================================================

UPDATE spaces s SET name = 'My space'
WHERE s.name = 'My Space'
  AND NOT EXISTS (
    SELECT 1 FROM spaces s2
    WHERE s2.workspace_id = s.workspace_id AND s2.name = 'My space'
  );

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');
  INSERT INTO spaces (name, workspace_id) VALUES ('My space', v_workspace_id) RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
