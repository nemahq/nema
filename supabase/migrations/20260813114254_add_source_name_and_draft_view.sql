-- =============================================================
-- 다이제스트 화면 슬라이스 팔로업: 원문 이름을 조회가 아니라 행의 성질로 옮기고,
-- 초안 필터를 뷰로 내린다.
--
-- 이름 — listWithDigests·listDraftSources·source.get 셋 다 같은 이름을 쓴다.
-- 조회마다 body를 끌어와 서버에서 자르던 걸(60자+"…") 생성 컬럼으로 옮겨,
-- 정의를 한 곳에 두고 세 조회가 body 없이 읽게 한다. 200은 표시 폭이 아니라
-- 응답 폭주를 막는 상한이라 "…"를 안 붙인다 — 자르는 건 화면 몫이다.
--
-- 초안 필터 — listDraftSources가 상한(500)을 먼저 걸고 그다음 JS에서 걸렀다.
-- 원문이 500개를 넘으면 최신 500개 안에 초안이 없을 때 실제로는 있어도 빈
-- 목록이 나왔다(에러 없이 조용히 틀림). 뷰로 내려 걸러진 결과에 상한이 붙게
-- 한다. listWithDigests는 안 건드린다 — digests!inner가 이미 DB에서 거르고,
-- 중첩 배열이 있어 뷰로 만들면 PostgREST 타입이 무너진다(의도적으로 뷰 밖).
-- =============================================================

-- body가 NOT NULL이라 left(btrim(body), 200)은 함수적으로 never null이다 —
-- NOT NULL을 명시해 타입 생성(gen-types)에서도 `string | null`이 아니라
-- `string`으로 떨어지게 한다.
ALTER TABLE sources
  ADD COLUMN name text GENERATED ALWAYS AS (left(btrim(body), 200)) STORED NOT NULL;

COMMENT ON COLUMN sources.name IS
  '원문 이름 — 제목 칸이 없어 본문 앞부분으로 대신한다. 200은 폭주 방지 상한일 뿐
   표시 폭이 아니다(자르는 건 화면 몫, 여기선 "…"를 안 붙인다). 제목 칸이 생기면
   coalesce(title, left(btrim(body), 200))로 바꿀 자리가 여기 하나다.';

-- security_invoker=true로 만들어 sources의 owner-only RLS가 조회자 기준으로
-- 그대로 걸리게 한다(뷰 소유자 postgres 권한으로 새는 것을 막음) —
-- v_metrics_summary 등 기존 뷰와 같은 관례.
CREATE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status
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
