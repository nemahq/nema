-- =============================================================
-- save-engine-v2 3/6: 원자 층 — sources, statements, statement_sources
-- 원자 = 진술(Statement). 합성 문서는 pull 시점 뷰로 강등.
-- 원본(sources)은 무손실 박제 + 추출 작업 상태(save_jobs 흡수).
-- 임베딩 대상은 진술뿐 — 원본은 의미로 다루지 않는다.
-- =============================================================

CREATE TYPE source_status        AS ENUM ('active', 'archived');
CREATE TYPE statement_type       AS ENUM ('claim', 'question', 'todo');
CREATE TYPE statement_confidence AS ENUM ('certain', 'guess');
CREATE TYPE statement_status     AS ENUM ('active', 'archived');
-- 추출(sources.extraction_status)·임베딩(statements.ingestion_status)은
-- 같은 3-상태(pending|completed|failed)라 기존 ingestion_status enum 공유

-- ----- 원본: 무손실 박제 + 추출 작업 상태 -----
CREATE TABLE sources (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                 uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 누가 넣었나(사람 산물). 계정 삭제 시 익명으로 보존
  session_id               uuid REFERENCES sessions(id) ON DELETE SET NULL,    -- 어느 대화에서 왔나(선택)
  body                     text NOT NULL,                                      -- 원문 그대로
  status                   source_status NOT NULL DEFAULT 'active',
  -- 추출 작업 추적 (save_jobs 흡수)
  extraction_status        ingestion_status NOT NULL DEFAULT 'pending',
  extraction_retry_count   int NOT NULL DEFAULT 0,
  last_extraction_attempt  timestamptz,
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ----- 진술: 새 원자 -----
-- author_id 없음 — 엔진 산물. 출처는 statement_sources → sources.author_id로 파생.
CREATE TABLE statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  content     text NOT NULL,                              -- 그 '왜' 자체
  type        statement_type NOT NULL,
  confidence  statement_confidence,                       -- claim에서만
  status      statement_status NOT NULL DEFAULT 'active',
  -- 임베딩 동기화 (1진술 = 1벡터)
  ingestion_status        ingestion_status NOT NULL DEFAULT 'pending',
  ingestion_retry_count   int NOT NULL DEFAULT 0,
  last_ingestion_attempt  timestamptz,
  error_message           text,                           -- 임베딩 실패 이유 (sources의 추출 실패와 대칭)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 확신도 무결성: claim이면 반드시 있고, 그 외엔 반드시 없음
  CONSTRAINT chk_confidence_only_claim CHECK (
    (type = 'claim' AND confidence IS NOT NULL)
    OR (type <> 'claim' AND confidence IS NULL)
  )
);

-- ----- SourceRef: 진술 → 원본 포인터 (다중) -----
CREATE TABLE statement_sources (
  statement_id  uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  locator       jsonb,  -- 원본 내 위치, 자리만(안 채움)
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_id, source_id)
);

-- =============================================================
-- Indexes
-- =============================================================

CREATE INDEX idx_sources_space_created    ON sources (space_id, created_at DESC);
CREATE INDEX idx_sources_pending          ON sources (id) WHERE extraction_status = 'pending';  -- 추출 worker 폴링
CREATE INDEX idx_statements_space_created ON statements (space_id, created_at DESC);
CREATE INDEX idx_statements_pending       ON statements (id) WHERE ingestion_status = 'pending';  -- 임베딩 worker 폴링
CREATE INDEX idx_statement_sources_source ON statement_sources (source_id);  -- 원본→진술 역방향(원본 빼기)

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_statements_updated_at
  BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 추출 관계는 Space를 가로지르지 않는다 — 양끝이 같은 Space여야 함.
-- 의미상 확정적이라 지금 박는다. (statement_relations는 반대 — 가로지를 수 있음)
CREATE OR REPLACE FUNCTION enforce_statement_source_same_space()
RETURNS trigger AS $$
DECLARE
  v_statement_space uuid;
  v_source_space    uuid;
BEGIN
  SELECT space_id INTO v_statement_space FROM statements WHERE id = NEW.statement_id;
  SELECT space_id INTO v_source_space    FROM sources    WHERE id = NEW.source_id;

  IF v_statement_space IS DISTINCT FROM v_source_space THEN
    RAISE EXCEPTION 'statement_sources requires statement and source in the same space (statement: %, source: %)',
      v_statement_space, v_source_space;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_statement_sources_same_space
  BEFORE INSERT ON statement_sources
  FOR EACH ROW EXECUTE FUNCTION enforce_statement_source_same_space();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sources_member_select" ON sources
  FOR SELECT USING (is_space_member(space_id));

CREATE POLICY "statements_member_select" ON statements
  FOR SELECT USING (is_space_member(space_id));

CREATE POLICY "statement_sources_member_select" ON statement_sources
  FOR SELECT USING (
    statement_id IN (SELECT id FROM statements WHERE is_space_member(space_id))
  );
