-- =============================================================
-- 용어 사전 v2 모델링: Statement의 Digest·Reference 연결 (07-modeling.md)
--
-- 1) statements.digest_id — 어느 Digest에서 추출됐나. Source가 아니라 Digest를
--    직접 참조한다(확정 후 안 바뀌는 Digest라 근거가 안정적). nullable —
--    Digest 개념 이전(v1)에 생긴 진술은 가리킬 Digest가 없고, 그 사실을
--    그대로 두기로 합의(더미 Digest 백필은 피드 오염이라 배제).
-- 2) statement_references — Statement가 실제로 언급하는 Reference(문장 단위
--    정밀 매핑). Digest.referenceIds가 리뷰 단계의 후보군이라면 이건 2단계
--    생성 때의 확정본 — Reference 상세의 역참조·해설 인용이 이 정밀도를 쓴다.
-- 3) relation_type에 duplicates 추가 — 같은 뜻 중복의 대체. replaces와 폐기
--    메커니즘은 같지만 원인이 달라 표식에서 다르게 설명된다. 값만 추가 —
--    현행 중복 병합(duplicate_of)의 관계 전환은 파이프라인 개편에서.
-- =============================================================

-- 같은 트랜잭션에서 이 값을 참조하는 것이 없으므로 ADD VALUE로 충분
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'duplicates';

-- =============================================================
-- statements.digest_id
-- ON DELETE 규칙 없음(NO ACTION) — Digest의 hard delete는 완전 삭제 purge뿐이고,
-- 그 purge는 파생 진술을 먼저 정리하며 온다. SET NULL로 두면 purge 누락 시
-- "v1 유래"(digest 없음이 사실)와 구분이 안 되는 NULL이 생겨 오히려 은폐다.
-- =============================================================

ALTER TABLE statements ADD COLUMN digest_id uuid REFERENCES digests(id);

-- Digest → 파생 진술 조회 (되돌림 범위 계산·Digest 상세)
CREATE INDEX idx_statements_digest ON statements (digest_id) WHERE digest_id IS NOT NULL;

-- =============================================================
-- statement_references
-- =============================================================

CREATE TABLE statement_references (
  statement_id  uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  reference_id  uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_id, reference_id)
);

-- Reference 역참조("이 인물이 언급된 진술들") — 정방향은 PK가 커버
CREATE INDEX idx_statement_references_reference ON statement_references (reference_id);

-- 인용은 Workspace 경계 안에서만 (digest_references와 같은 결)
CREATE OR REPLACE FUNCTION enforce_statement_reference_same_workspace()
RETURNS trigger AS $$
DECLARE
  v_statement_workspace uuid;
  v_reference_workspace uuid;
BEGIN
  SELECT sp.workspace_id INTO v_statement_workspace
  FROM statements st JOIN spaces sp ON sp.id = st.space_id
  WHERE st.id = NEW.statement_id;

  SELECT workspace_id INTO v_reference_workspace
  FROM "references" WHERE id = NEW.reference_id;

  IF v_statement_workspace IS DISTINCT FROM v_reference_workspace THEN
    RAISE EXCEPTION 'statement_references requires statement and reference in the same workspace (statement: %, reference: %)',
      v_statement_workspace, v_reference_workspace;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_statement_references_same_workspace
  BEFORE INSERT OR UPDATE ON statement_references
  FOR EACH ROW EXECUTE FUNCTION enforce_statement_reference_same_workspace();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE statement_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statement_references_member_select" ON statement_references
  FOR SELECT USING (
    statement_id IN (SELECT id FROM statements WHERE is_space_member(space_id))
  );
