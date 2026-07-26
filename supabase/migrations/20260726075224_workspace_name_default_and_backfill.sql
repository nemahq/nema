-- =============================================================
-- workspaces.name 생성 시점 기본값 채우기
--
-- 지금까지 handle_new_user()가 workspaces.name을 NULL로 남겨두고,
-- bootstrapWorkspace()가 매 조회마다 membership.workspaces.name ?? bootstrapUser.name으로
-- read-time 폴백해왔다. 다인원 워크스페이스에서 이 폴백은 "조회하는 사람의" 이름을
-- 보여주는 꼴이라, 보는 사람마다 다른 워크스페이스 이름이 뜨는 버그였다.
--
-- 문구 조합("~의 워크스페이스") 없이, 지금 폴백이 보여주던 값과 동일하게
-- 계정 표시 이름을 생성 시점에 그대로 저장한다(저장 시점만 앞당김).
-- 표시 이름 우선순위는 apps/server/src/services/workspace-service.ts의
-- toBootstrapUser()(given_name → full_name → email)와 동일하게 SQL로 재구현한다.
-- =============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
  v_public_id    text;
  v_attempt      int;
  v_display_name text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'given_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.email, ''),
    NEW.id::text
  );

  INSERT INTO workspaces (name) VALUES (v_display_name) RETURNING id INTO v_workspace_id;
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

-- 기존 NULL row 백필 — 각 워크스페이스에서 가장 먼저 합류한(=최고참) 멤버의
-- 표시 이름으로 채운다. 새 가입은 위 트리거가 처리하므로 지금 NULL인 row만 대상.
UPDATE workspaces w
SET name = (
  SELECT COALESCE(
    NULLIF(u.raw_user_meta_data->>'given_name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.email, ''),
    u.id::text
  )
  FROM workspace_members wm
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = w.id
  ORDER BY wm.created_at ASC
  LIMIT 1
)
WHERE w.name IS NULL;

-- 생성 시점에 항상 채워지므로 이제부터는 필수 필드다.
ALTER TABLE workspaces ALTER COLUMN name SET NOT NULL;
