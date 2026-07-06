-- =============================================================
-- 용어 사전 v2 모델링: references 신설 (07-modeling.md)
-- Reference = Digest 틀에 안 맞지만 반복 참조되는 것(인물·조직·프로젝트·
-- 제품·개념). 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이
-- 다듬어진다. 재사용 스코프는 Space가 아니라 Workspace 전체.
-- Statement·Digest에서의 인용(referenceIds)은 각자의 PR에서 조인으로.
-- =============================================================

-- organization은 법인·팀 같은 행위주체, product는 그 주체가 만든 제품·서비스
-- 자체(예: 비바리퍼블리카 vs 토스) — 판단 대상이 달라 구분한다.
CREATE TYPE reference_type   AS ENUM ('person', 'organization', 'project', 'product', 'term');
CREATE TYPE reference_status AS ENUM ('active', 'archived');

CREATE TABLE "references" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          reference_type NOT NULL,
  title         text NOT NULL,           -- 가리키는 대상의 이름
  body          text NOT NULL,           -- 다듬어지며 유지되는 내용 (설명 포함)
  external_urls text[],                  -- 대표 링크들 (홈페이지·LinkedIn 등), 선택
  status        reference_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----- 관련 Reference (relatedReferenceIds) — 느슨한 상호 참조라 방향 없음 -----
-- 무방향을 정규화된 한 행으로 저장: (작은 id, 큰 id) 순서를 CHECK로 강제해
-- (A,B)·(B,A) 이중 저장을 원천 차단한다. 양쪽에서의 조회는 앱이 OR로 본다.
-- 쓰기 계약: 링크 생성 RPC가 두 id의 정렬과 존재 검사를 캡슐화해야 한다
-- (정렬해 넣으면 존재 검사도 한 방향만 보면 된다) — 직접 INSERT 금지.
CREATE TABLE reference_links (
  reference_a_id  uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  reference_b_id  uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reference_a_id, reference_b_id),
  CONSTRAINT chk_reference_link_ordered CHECK (reference_a_id < reference_b_id)
);

-- =============================================================
-- Indexes
-- =============================================================

-- Workspace별 Reference 목록 (type 필터 포함)
CREATE INDEX idx_references_workspace ON "references" (workspace_id, type);
-- 링크 역방향 조회 (정방향은 PK가 커버)
CREATE INDEX idx_reference_links_b ON reference_links (reference_b_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_references_updated_at
  BEFORE UPDATE ON "references"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 링크는 Workspace를 가로지르지 않는다 — 양끝이 같은 Workspace여야 함
-- (statement_sources의 same-space 강제와 같은 결).
CREATE OR REPLACE FUNCTION enforce_reference_link_same_workspace()
RETURNS trigger AS $$
DECLARE
  v_workspace_a uuid;
  v_workspace_b uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_a FROM "references" WHERE id = NEW.reference_a_id;
  SELECT workspace_id INTO v_workspace_b FROM "references" WHERE id = NEW.reference_b_id;

  IF v_workspace_a IS DISTINCT FROM v_workspace_b THEN
    RAISE EXCEPTION 'reference_links requires both references in the same workspace (a: %, b: %)',
      v_workspace_a, v_workspace_b;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_reference_links_same_workspace
  BEFORE INSERT OR UPDATE ON reference_links
  FOR EACH ROW EXECUTE FUNCTION enforce_reference_link_same_workspace();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE "references"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "references_member_select" ON "references"
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "reference_links_member_select" ON reference_links
  FOR SELECT USING (
    reference_a_id IN (SELECT id FROM "references" WHERE is_workspace_member(workspace_id))
  );
