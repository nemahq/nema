-- =============================================================
-- 용어 사전 v2 모델링 1단계: workspaces 신설 (07-modeling.md)
-- Workspace = 사람과 결제를 묶는 계정 단위. Space 위의 새 최상위 스코프.
-- 이 마이그레이션은 테이블만 만든다 — 참조(spaces.workspace_id)·명단
-- (workspace_members)·백필은 다음 마이그레이션에서 이어진다.
-- status 없음 — 삭제 화면 근거가 없어 두지 않는다(07-modeling.md).
-- =============================================================

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,  -- 채우는 정책은 구현 단계. spaces.name과 같은 이유로 nullable
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — 켜두되 정책은 아직 없음(전부 차단).
-- 멤버십 판정(is_workspace_member)은 workspace_members가 생기는
-- 다음 마이그레이션에서 SELECT 정책과 함께 붙는다.
-- 그 전까지 이 테이블을 읽는 코드 경로가 없으므로 deny-all이 맞다.
-- =============================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
