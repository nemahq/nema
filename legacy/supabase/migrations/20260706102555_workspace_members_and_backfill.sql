-- =============================================================
-- 용어 사전 v2 모델링 2단계: Space를 Workspace 아래로 (07-modeling.md)
--   1) workspace_members 신설 + is_workspace_member + RLS 정책
--   2) spaces.workspace_id 추가
--   3) 백필 — 기존 Space 1개당 Workspace 1개 생성, 명단 복제
--   4) workspace_id NOT NULL 승격 ("모든 Space는 Workspace에 속한다" 불변식)
--   5) handle_new_user 확장 — 가입 시 Workspace → Space 순 생성
--   6) Owner 0명 금지 가드 (Slack·Notion 공통 원칙, 07-modeling.md 동작 규칙)
-- =============================================================

CREATE TYPE workspace_role AS ENUM ('owner', 'member');

-- ----- 사람 ↔ Workspace 명단 (space_members와 같은 패턴 — id 없는 조인) -----
CREATE TABLE workspace_members (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          workspace_role NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 사용자→Workspace 역조회용 (등치 조회는 PK가 커버 — space_members와 대칭)
CREATE INDEX idx_workspace_members_user ON workspace_members (user_id);

CREATE TRIGGER trg_workspace_members_updated_at
  BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----- 멤버십 판정 헬퍼 (is_space_member와 대칭) -----
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ----- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유 -----
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_member_select" ON workspaces
  FOR SELECT USING (is_workspace_member(id));

CREATE POLICY "workspace_members_member_select" ON workspace_members
  FOR SELECT USING (is_workspace_member(workspace_id));

-- =============================================================
-- spaces.workspace_id + 백필
-- ON DELETE 규칙 없음(NO ACTION) — Workspace 삭제는 별도 상태 없이
-- Space 완전 삭제 캐스케이드를 부채꼴로 실행하는 명시적 동작이라(07-modeling.md),
-- FK가 조용히 지우지 않고 막는 쪽이 맞다.
-- =============================================================

ALTER TABLE spaces ADD COLUMN workspace_id uuid REFERENCES workspaces(id);

-- ----- 백필: Space 1개당 Workspace 1개 + 명단 복제 -----
-- 현재 Space 생성 경로는 가입 트리거뿐이라 사실상 유저:Space 1:1.
-- name은 spaces.name과 같은 이유로 NULL(채우는 정책은 표면 설계 단계).
DO $$
DECLARE
  v_space_id     uuid;
  v_workspace_id uuid;
BEGIN
  FOR v_space_id IN SELECT id FROM spaces WHERE workspace_id IS NULL
  LOOP
    INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;

    UPDATE spaces SET workspace_id = v_workspace_id WHERE id = v_space_id;

    INSERT INTO workspace_members (workspace_id, user_id, role)
    SELECT v_workspace_id, user_id, role::text::workspace_role
    FROM space_members
    WHERE space_id = v_space_id;
  END LOOP;
END $$;

ALTER TABLE spaces ALTER COLUMN workspace_id SET NOT NULL;

-- Workspace→Space 목록 조회용
CREATE INDEX idx_spaces_workspace ON spaces (workspace_id);

-- =============================================================
-- 가입 트리거 확장 — Workspace → Space 순으로 생성, 양쪽 명단에 owner 등록
-- =============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');
  INSERT INTO spaces (name, workspace_id) VALUES (NULL, v_workspace_id) RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Owner 0명 금지 가드 — 마지막 owner의 행 제거·강등을 막는다.
-- 자동 승계 없음: 소유권을 먼저 넘겨야 나갈 수 있다(07-modeling.md 동작 규칙).
-- Workspace 자체가 삭제되는 캐스케이드는 예외 — 부모가 이미 지워졌으면 통과.
-- =============================================================

CREATE OR REPLACE FUNCTION enforce_workspace_owner_exists()
RETURNS trigger AS $$
BEGIN
  IF OLD.role <> 'owner' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 강등이 아닌 변경(owner 유지)은 통과
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.workspace_id = OLD.workspace_id THEN
    RETURN NEW;
  END IF;

  -- Workspace 완전 삭제의 캐스케이드면 통과 (지킬 대상이 없음)
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 계정 삭제(auth.users 행 소멸)의 캐스케이드면 통과 — 이 가드는 "남아 있는
  -- 사람"의 이탈·강등만 막는다. 소유권 이전 강제는 계정 삭제 흐름(앱 레이어)의
  -- 몫이고, DB가 여기서 막으면 e2e 테스트 유저 정리 같은 관리자 삭제도 깨진다.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND user_id <> OLD.user_id
  ) THEN
    RAISE EXCEPTION 'workspace % must have at least one owner — transfer ownership first', OLD.workspace_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_workspace_members_owner_guard
  BEFORE DELETE OR UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION enforce_workspace_owner_exists();
