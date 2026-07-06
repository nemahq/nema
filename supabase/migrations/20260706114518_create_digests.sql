-- =============================================================
-- 용어 사전 v2 모델링: digests 신설 (07-modeling.md)
-- Digest = Source를 사람이 읽기 좋게 정리한 것. 여기서 Statement가 추출된다.
-- Source 1개가 여러 Digest를 낳을 수 있고(판단 유형별로 쪼개짐), 새 Source는
-- 새 Digest를 만들 뿐 기존 Digest를 안 건드린다. 확정(active) 후 불변.
--
-- 이 PR은 그릇만 — 생성 파이프라인(1단계 리뷰 게이트)·Statement의 digest_id
-- 참조는 후속. Topic·Tag 연결(digest_topics/digest_tags)은 Topic 재배선과 함께
-- 인테이크 개편으로 미룸(합의). Reference 인용과 관련 Digest 링크는 여기서 조인으로.
-- =============================================================

CREATE TYPE digest_status AS ENUM ('active', 'archived');

-- DigestBody의 판별 유니언 타입 — body JSONB의 type 필드를 CHECK로 고정
-- (필드 구성은 타입별로 다르고 전부 optional이라 DB는 판별자만 지킨다)
CREATE TABLE digests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  -- source_id로 유추 가능하지만 Space 오버뷰 메인 피드(Topic별 Digest 피드)가
  -- 이 값으로 직접 조회하므로 따로 둔다 (07-modeling.md)
  space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  locator       jsonb,                   -- Source 안에서 이 Digest가 나온 위치 (형식은 열어둠)
  title         text NOT NULL,           -- 헤드라인처럼 짧게
  description   text NOT NULL,           -- 한 줄 요약 — 피드 미리보기
  body          jsonb NOT NULL,
  external_urls text[],                  -- 정리 과정에서 원문에서 뽑아낸 외부 링크들
  author_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 계정 삭제 시 익명으로 보존
  status        digest_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_digest_body_type CHECK (
    body->>'type' IN ('decision', 'pending', 'learning', 'idea', 'assumption')
  )
);

-- ----- Digest → Reference 인용 (referenceIds) — 리뷰 단계의 후보군 -----
CREATE TABLE digest_references (
  digest_id     uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  reference_id  uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_id, reference_id)
);

-- ----- 관련 Digest (relatedDigestIds) — 느슨한 상호 참조라 방향 없음 -----
-- reference_links와 같은 설계: (작은 id, 큰 id) 정렬을 CHECK로 강제.
-- 쓰기 계약도 동일 — 링크 생성 RPC가 정렬·존재 검사를 캡슐화한다.
CREATE TABLE digest_links (
  digest_a_id  uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  digest_b_id  uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_a_id, digest_b_id),
  CONSTRAINT chk_digest_link_ordered CHECK (digest_a_id < digest_b_id)
);

-- =============================================================
-- Indexes
-- =============================================================

-- 메인 피드: Space별 최신순
CREATE INDEX idx_digests_space_created ON digests (space_id, created_at DESC);
-- 원본 상세 → 파생 Digest 조회 (원본 빼기의 되돌림 범위 계산도 이 경로)
CREATE INDEX idx_digests_source ON digests (source_id);
-- Reference 역참조("이 Reference를 언급하는 Digest들") — 정방향은 PK가 커버
CREATE INDEX idx_digest_references_reference ON digest_references (reference_id);
-- 링크 역방향 조회 (정방향은 PK가 커버)
CREATE INDEX idx_digest_links_b ON digest_links (digest_b_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_digests_updated_at
  BEFORE UPDATE ON digests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Digest는 Source와 같은 Space여야 한다 (statement_sources의 same-space와 같은 결)
CREATE OR REPLACE FUNCTION enforce_digest_same_space()
RETURNS trigger AS $$
DECLARE
  v_source_space uuid;
BEGIN
  SELECT space_id INTO v_source_space FROM sources WHERE id = NEW.source_id;

  IF v_source_space IS DISTINCT FROM NEW.space_id THEN
    RAISE EXCEPTION 'digest space must match its source space (digest: %, source: %)',
      NEW.space_id, v_source_space;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_digests_same_space
  BEFORE INSERT OR UPDATE ON digests
  FOR EACH ROW EXECUTE FUNCTION enforce_digest_same_space();

-- Reference 인용은 Workspace 경계 안에서만 — Digest가 속한 Space의 Workspace와
-- Reference의 Workspace가 같아야 한다 (Reference 재사용 스코프 = Workspace)
CREATE OR REPLACE FUNCTION enforce_digest_reference_same_workspace()
RETURNS trigger AS $$
DECLARE
  v_digest_workspace    uuid;
  v_reference_workspace uuid;
BEGIN
  SELECT sp.workspace_id INTO v_digest_workspace
  FROM digests d JOIN spaces sp ON sp.id = d.space_id
  WHERE d.id = NEW.digest_id;

  SELECT workspace_id INTO v_reference_workspace
  FROM "references" WHERE id = NEW.reference_id;

  IF v_digest_workspace IS DISTINCT FROM v_reference_workspace THEN
    RAISE EXCEPTION 'digest_references requires digest and reference in the same workspace (digest: %, reference: %)',
      v_digest_workspace, v_reference_workspace;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_digest_references_same_workspace
  BEFORE INSERT OR UPDATE ON digest_references
  FOR EACH ROW EXECUTE FUNCTION enforce_digest_reference_same_workspace();

-- 관련 Digest 링크는 Space를 가로지르지 않는다 — Digest는 Space 소유 콘텐츠이고
-- 교차 Space 공유 축은 아직 설계 전(10-concept-collaboration.md)
CREATE OR REPLACE FUNCTION enforce_digest_link_same_space()
RETURNS trigger AS $$
DECLARE
  v_space_a uuid;
  v_space_b uuid;
BEGIN
  SELECT space_id INTO v_space_a FROM digests WHERE id = NEW.digest_a_id;
  SELECT space_id INTO v_space_b FROM digests WHERE id = NEW.digest_b_id;

  IF v_space_a IS DISTINCT FROM v_space_b THEN
    RAISE EXCEPTION 'digest_links requires both digests in the same space (a: %, b: %)',
      v_space_a, v_space_b;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_digest_links_same_space
  BEFORE INSERT OR UPDATE ON digest_links
  FOR EACH ROW EXECUTE FUNCTION enforce_digest_link_same_space();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE digests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_links      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digests_member_select" ON digests
  FOR SELECT USING (is_space_member(space_id));

CREATE POLICY "digest_references_member_select" ON digest_references
  FOR SELECT USING (
    digest_id IN (SELECT id FROM digests WHERE is_space_member(space_id))
  );

CREATE POLICY "digest_links_member_select" ON digest_links
  FOR SELECT USING (
    digest_a_id IN (SELECT id FROM digests WHERE is_space_member(space_id))
  );
