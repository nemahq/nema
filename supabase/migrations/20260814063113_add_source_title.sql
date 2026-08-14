-- =============================================================
-- 원문 제목 칸. 엔진(정리 1콜)이 채우고 사람은 안 친다 — 편집 UI는 이번 범위 밖.
--
-- Postgres는 생성 컬럼의 표현식을 못 바꾼다 — sources.name을 DROP 후 새 정의로
-- 재생성해야 한다. v_draft_sources가 name을 참조하므로 뷰를 먼저 지우고, 컬럼을
-- 다시 만든 뒤 뷰를 재생성한다. body_preview는 이 변경과 무관해 안 건드린다.
--
-- 백필은 안 한다 — 이미 쌓인 원문은 title이 null이고 coalesce가 본문 앞 200자로
-- 받아준다. 다시 던지거나 재추출하면 채워진다.
-- =============================================================

DROP VIEW v_draft_sources;

ALTER TABLE sources DROP COLUMN name;

ALTER TABLE sources ADD COLUMN title text;

-- title 하나만 보면 nullable이지만, coalesce가 body(NOT NULL)로 받아 결과는
-- never null이다 — 이전 정의와 마찬가지로 NOT NULL을 명시해 타입 생성에서
-- `string`으로 떨어지게 한다.
--
-- 200자 상한은 title에도 그대로 건다 — coalesce 뒤에 자르지 않고 left(btrim(...))
-- 밖으로 빼면, title이 있든 없든 상한을 벗어날 길이 없다. title은 짧은 헤드라인을
-- 요구하는 프롬프트가 만들지만, 그 상한은 프롬프트가 지키겠다는 약속일 뿐 DB가
-- 강제하는 값이 아니다 — 응답 폭주 방지라는 이 컬럼의 존재 이유를 title 경로에서도
-- 놓치지 않으려면 여기서 다시 잘라야 한다.
ALTER TABLE sources
  ADD COLUMN name text GENERATED ALWAYS AS (left(btrim(coalesce(title, body)), 200)) STORED NOT NULL;

COMMENT ON COLUMN sources.name IS
  '원문 이름 — title이 있으면 그대로, 없으면 본문 앞부분으로 대신한다(200은 폭주
   방지 상한일 뿐 표시 폭이 아니다, 자르는 건 화면 몫이라 "…"를 안 붙인다 — title
   경로도 이 상한을 벗어나지 않는다). title은 이 원문의 던지기(정리+색인)가 끝까지
   성공했을 때만 채워진다 — 둘 중 하나라도 실패하면 null로 남고 이 coalesce가
   받아준다.';

COMMENT ON COLUMN sources.title IS
  '원문 제목. 정리(생성 1콜)가 원문 전체를 보고 함께 만든다 — 사람이 직접 치지
   않는다(편집 경로는 아직 없다). 정리가 실패하면 null로 남는다.';

CREATE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status, s.body_preview
FROM sources s
WHERE s.digestion_status = 'pending'
   OR NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = s.id);

COMMENT ON VIEW v_draft_sources IS
  '초안 화면(다이제스트가 없는 원문) 전용 조회. pending은 처리 중이거나 끝내
   완료되지 못한 원문이고, completed인데 digests 행이 0인 건 완료는 됐지만
   정리 결과가 하나도 안 나온 경우다 — 둘 다 초안으로 묶는다. 이 필터를
   listDraftSources의 JS 쪽에 두면 상한이 거르기 전에 먼저 걸려 원문이 많을 때
   실제로 있는 초안이 빈 목록으로 보일 수 있다(에러 없이 조용히 틀림) — 뷰로
   내려 걸러진 결과에 상한이 붙게 한다.';
