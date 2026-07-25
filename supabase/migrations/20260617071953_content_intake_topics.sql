-- =============================================================
-- content-intake 1/3: 주제 레지스트리 — topics, source_topics, sources.title
-- 공간에 쌓이는 재사용 주제 목록 = 지도의 줄기 목록. 평평한 단일 라벨(계층/군집 없음).
-- 원문 0..N 주제(멀티 라벨, 무태그 허용). 진술의 주제는 join으로 파생 — 엔진 무손상.
-- =============================================================

-- ----- 주제 레지스트리: 재사용 라벨. UNIQUE(space_id, name)로 중복 라벨 차단 -----
CREATE TABLE topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, name)
);

-- ----- 원문 ↔ 주제 (멀티 라벨). 진술의 주제는 statement_sources -> source_topics로 파생 -----
CREATE TABLE source_topics (
  source_id   uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  topic_id    uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, topic_id)
);

-- ----- 원문 제목 (확정 시 초안 제목이 넘어옴). 추출 워커는 안 읽음 = 엔진 무영향 -----
ALTER TABLE sources ADD COLUMN title text;

-- =============================================================
-- Indexes
-- =============================================================

-- 주제 목록 조회(공간별) + UNIQUE가 (space_id, name) 등치도 커버
CREATE INDEX idx_topics_space ON topics (space_id);
-- 주제 -> 원문 역조회(줄기 펼치기). 원문 -> 주제는 PK(source_id, topic_id)가 커버
CREATE INDEX idx_source_topics_topic ON source_topics (topic_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 원문 ↔ 주제는 Space를 가로지르지 않는다 — 양끝이 같은 Space여야 함
-- (statement_sources의 same-space 강제와 같은 결).
CREATE OR REPLACE FUNCTION enforce_source_topic_same_space()
RETURNS trigger AS $$
DECLARE
  v_source_space uuid;
  v_topic_space  uuid;
BEGIN
  SELECT space_id INTO v_source_space FROM sources WHERE id = NEW.source_id;
  SELECT space_id INTO v_topic_space  FROM topics  WHERE id = NEW.topic_id;

  IF v_source_space IS DISTINCT FROM v_topic_space THEN
    RAISE EXCEPTION 'source_topics requires source and topic in the same space (source: %, topic: %)',
      v_source_space, v_topic_space;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_source_topics_same_space
  BEFORE INSERT OR UPDATE ON source_topics
  FOR EACH ROW EXECUTE FUNCTION enforce_source_topic_same_space();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE topics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics_member_select" ON topics
  FOR SELECT USING (is_space_member(space_id));

CREATE POLICY "source_topics_member_select" ON source_topics
  FOR SELECT USING (
    source_id IN (SELECT id FROM sources WHERE is_space_member(space_id))
  );
