-- =============================================================
-- content-intake 2/3: 초안(draft) — 확정 직전 대기 자리
-- 1급 엔티티(여러 개, id로 다룸), 사람+MCP 공동 편집. 두 입구가 같은 자리에 쓴다.
-- 상태 컬럼 없음: 행이 존재 = 대기중. 확정/폐기 = 행 삭제(확정 시 source로 승격).
-- =============================================================

CREATE TYPE draft_origin AS ENUM ('in_app', 'external');

CREATE TABLE drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 출처 보존(이 슬라이스 미사용, 멀티 유저 대비)
  origin          draft_origin NOT NULL,
  title           text,
  body            text NOT NULL DEFAULT '',
  -- 제안된 주제(이름 문자열). 확정 시 레지스트리로 resolve — 미확정 동안은 목록 오염 안 시킴
  proposed_topics text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- Indexes
-- =============================================================

-- 대기 초안 목록(인박스): 공간별 최신순
CREATE INDEX idx_drafts_space_created ON drafts (space_id, created_at DESC);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drafts_member_select" ON drafts
  FOR SELECT USING (is_space_member(space_id));
