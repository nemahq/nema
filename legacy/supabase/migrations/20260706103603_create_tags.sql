-- =============================================================
-- 용어 사전 v2 모델링: tags 신설 (07-modeling.md)
-- Tag = 재사용 라벨. Topic과 달리 Workspace 안에서 Space를 가로질러
-- 재사용되고, 흐름(Thread)을 만들지 않는다. 이름이 추상적인 방법론
-- 분류라(예: 경쟁전략) 재사용 판단 기준이 될 정의(description)를 갖는다.
-- Digest와의 연결은 인테이크 파이프라인 개편에서 — 여기선 레지스트리만.
-- =============================================================

CREATE TYPE tag_status AS ENUM ('active', 'archived');

CREATE TABLE tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL,  -- 정의 — 재사용 시 이 태그가 맞는지 판단하는 기준
  status        tag_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 중복 라벨 차단 (topics의 UNIQUE(space_id, name)와 같은 결, 스코프만 Workspace)
  UNIQUE (workspace_id, title)
);

-- 별도 workspace_id 인덱스 없음 — UNIQUE(workspace_id, title)의 복합 인덱스
-- 선두 컬럼이 workspace_id라 목록 조회를 이미 커버한다.

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_member_select" ON tags
  FOR SELECT USING (is_workspace_member(workspace_id));
