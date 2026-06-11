-- =============================================================
-- save-engine-v2 5/6: 관계 층 — statement_relations (자리만, 엔진 미연결)
-- same-space를 강제하지 않는다 — statement_sources와 정반대.
-- 관계는 Space를 가로지를 수 있다(다른 사람 진술에 내가 반박/근거를 단다).
-- space_id는 만든 쪽의 것이고 끝점은 다른 Space일 수 있다.
-- author_id 없음 — 엔진 산물. 소유는 space_id로만.
-- 엔진 단계로 미룬 것: 끝점 archived → 관계 연쇄 archived 트리거,
-- (from_id, to_id, type) 중복 방지 unique.
-- =============================================================

CREATE TYPE relation_type   AS ENUM ('supports', 'conflicts', 'replaces', 'resolves');
CREATE TYPE relation_status AS ENUM ('active', 'archived');

CREATE TABLE statement_relations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type        relation_type NOT NULL,  -- conflicts는 논리상 대칭이나 저장은 방향으로 두고 동작에서 대칭 처리
  from_id     uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  to_id       uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  status      relation_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_no_self_relation CHECK (from_id <> to_id)
);

-- =============================================================
-- Indexes
-- =============================================================

CREATE INDEX idx_statement_relations_from  ON statement_relations (from_id);
CREATE INDEX idx_statement_relations_to    ON statement_relations (to_id);
CREATE INDEX idx_statement_relations_space ON statement_relations (space_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_statement_relations_updated_at
  BEFORE UPDATE ON statement_relations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE statement_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statement_relations_member_select" ON statement_relations
  FOR SELECT USING (is_space_member(space_id));
