-- =============================================================
-- source-ingest 슬라이스: sources·digests 신설
--
-- 원문 넣기 → 다이제스트 추출까지(동기, LLM 1콜)의 저장 계층.
-- docs/blueprints/first-product/engine/organizing.md의 최종 설계 중 이번 스코프는
-- 1.1(원문 받기, 단 큐·워커·재시도는 제외)과 1.5(다이제스트 만들기, 단 주제는 제외)뿐이다.
-- 진술·관계·주제·레퍼런스·제목·워크스페이스/Space는 전부 다음 순서.
-- =============================================================

CREATE TYPE digestion_status AS ENUM ('pending', 'completed');
CREATE TYPE digest_type AS ENUM ('decision', 'pending', 'learning', 'idea', 'assumption');

-- 이후 신설되는 모든 mutable 테이블이 공유할 updated_at 자동 갱신 함수.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body              text NOT NULL,
  digestion_status  digestion_status NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 내 원문 목록 최신순 조회 경로.
CREATE INDEX idx_sources_user_created ON sources (user_id, created_at DESC);

-- Digest = Source를 유형별로 쪼갠 정리본. 확정 후 불변 — 재추출은 고치는 게 아니라
-- 지우고 새로 만든다. 그래서 updated_at·user_id가 없다: 소유는 source_id 조인으로
-- 판정한다(아래 RLS). type은 조회에 쓰여 컬럼으로 뺐고, 유형마다 다른 나머지 칸은
-- body jsonb에 담는다(칸 구조가 아직 흔들려 펼치면 대부분 NULL인 15개 컬럼이 된다).
CREATE TABLE digests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type        digest_type NOT NULL,
  title       text NOT NULL,
  body        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 원문 상세 → 파생 Digest 조회, 재추출 전 삭제 경로.
CREATE INDEX idx_digests_source ON digests (source_id);

-- =============================================================
-- RLS — owner-only. digests는 자기 user_id가 없어 source_id 조인으로 소유를 잰다.
-- =============================================================

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sources_owner_select" ON sources
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "sources_owner_insert" ON sources
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sources_owner_update" ON sources
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sources_owner_delete" ON sources
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "digests_owner_select" ON digests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = digests.source_id AND sources.user_id = auth.uid()
    )
  );

CREATE POLICY "digests_owner_insert" ON digests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = digests.source_id AND sources.user_id = auth.uid()
    )
  );

CREATE POLICY "digests_owner_delete" ON digests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = digests.source_id AND sources.user_id = auth.uid()
    )
  );
