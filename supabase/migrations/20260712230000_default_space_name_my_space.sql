-- =============================================================
-- 가입 시 자동 생성되는 기본 Space 이름을 "Default"에서 "My Space"로 교체.
--
-- 여전히 로케일 인식이 없는 하드코딩 리터럴이라는 한계는 그대로다(Postgres
-- 트리거는 유저의 UI 언어를 알 방법이 없음) — "Default"도 원래 이 수준이었고,
-- 제대로 된 로케일 분기는 가입 시점 언어 캡처 파이프라인이 필요해 범위 밖(Kyle
-- 논의 참고, design-decisions-log.md). 최소한 더 따뜻하고 개인적인 톤으로만 교체.
--
-- 아직 이름을 안 바꾼(리터럴 "Default" 그대로인) 기존 Space도 20260710070941의
-- NULL 백필과 같은 논리로 함께 백필한다 — 사용자가 실제로 "Default"라는 이름을
-- 의도적으로 고른 경우는 사실상 없다고 봄.
-- shared의 DEFAULT_SPACE_NAME과 값을 맞춰 둘 것 — 리터럴 두 곳이라 자동 강제는 없다.
-- =============================================================

UPDATE spaces SET name = 'My Space' WHERE name = 'Default';

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');
  INSERT INTO spaces (name, workspace_id) VALUES ('My Space', v_workspace_id) RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
