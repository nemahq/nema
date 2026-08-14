-- =============================================================
-- 초안 화면 카드 본문 미리보기(4줄) 전용 컬럼.
--
-- sources.name(200자, 제목 자리)과 같은 방식으로 만든 생성 컬럼이다 — 본문
-- 전체를 실으면 과다 전송 문제가 되돌아오니 400자로 잘라 낸다. name과 마찬가지로
-- 표시 폭이 아니라 응답 폭주를 막는 상한이라 "…"를 안 붙인다.
-- =============================================================

ALTER TABLE sources
  ADD COLUMN body_preview text GENERATED ALWAYS AS (left(btrim(body), 400)) STORED NOT NULL;

COMMENT ON COLUMN sources.body_preview IS
  '초안 카드 본문 미리보기(line-clamp-4)용. 400은 폭주 방지 상한일 뿐 표시 폭이
   아니다(자르는 건 화면 몫, 여기선 "…"를 안 붙인다) — sources.name과 같은 관례.';

-- CREATE OR REPLACE VIEW은 기존 컬럼 순서를 못 바꾼다 — 새 컬럼은 끝에 붙인다.
CREATE OR REPLACE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status, s.body_preview
FROM sources s
WHERE s.digestion_status = 'pending'
   OR NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = s.id);
