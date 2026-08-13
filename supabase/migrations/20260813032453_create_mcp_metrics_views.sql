-- =============================================================
-- mcp-usage-log 슬라이스: 지표 뷰 3종
--
-- materialized view는 안 쓴다 — 데이터가 작아 매번 계산해도 즉시 나온다.
-- public 스키마에 둔다 — 나중에 웹 대시보드를 만들면 그대로 API로 조회된다.
-- security_invoker=true로 만들어 그때도 mcp_tool_calls의 owner-only RLS가
-- 조회자 기준으로 그대로 걸리게 한다(뷰 소유자 postgres 권한으로 새는 것을 막음).
--
-- 컬럼은 영어로 둔다 — 이 뷰가 나중에 API로 그대로 나가면 컬럼명이 JSON 키가
-- 되는데, 한국어·공백 섞인 키는 API 계약으로 어색하다. 사람이 읽을 설명은 이미
-- COMMENT ON COLUMN으로 Supabase Studio Description에 뜨므로 컬럼명 자체를
-- 한국어로 할 이유가 없다.
--
-- 지표 정의는 comment로 코드에 남긴다. 뜻·방향은 적되 경계값(예: "0.3을 넘으면
-- 부실")은 안 적는다 — 지금은 근거가 없고, threshold는 v_search_results로
-- 라벨링해 나중에 정하기로 했다.
-- =============================================================

-- =============================================================
-- v_metrics_summary — 한눈에 보는 요약. 세로 구조(UNION ALL) — 컬럼을 옆으로
-- 늘어놓으면 그리드에서 스크롤해야 해서 "한눈에"가 안 된다.
-- 총 던지기~평균 최고점수 순서로 보이게 sort_order로 강제한다 — UNION ALL은
-- ORDER BY 없이는 각 분기 순서가 그대로 나온다는 보장이 없다.
-- =============================================================

CREATE VIEW v_metrics_summary WITH (security_invoker = true) AS
WITH search_calls AS (
  SELECT
    detail,
    (
      SELECT max((r->>'score')::double precision)
      FROM jsonb_array_elements(detail->'results') r
    ) AS top_score
  FROM mcp_tool_calls
  WHERE tool = 'search_digests'
),
stats AS (
  SELECT
    (SELECT count(*) FROM sources) AS total_ingests,
    (SELECT count(*) FROM search_calls) AS total_searches,
    (
      SELECT count(*) FROM search_calls
      WHERE jsonb_array_length(detail->'results') = 0
    ) AS zero_result_searches,
    (
      SELECT count(*) FROM mcp_tool_calls WHERE tool = 'get_source'
    ) AS total_source_views,
    (
      SELECT avg(top_score) FROM search_calls WHERE top_score IS NOT NULL
    ) AS avg_top_score
),
rows AS (
  SELECT 1 AS sort_order, '총 던지기' AS metric, total_ingests::numeric AS value,
         'sources 행 수' AS description, NULL::text AS direction
  FROM stats
  UNION ALL
  SELECT 2, '총 꺼내기', total_searches::numeric,
         'mcp_tool_calls(tool=search_digests) 행 수', NULL
  FROM stats
  UNION ALL
  SELECT 3, '꺼내기 / 던지기',
         round(total_searches::numeric / nullif(total_ingests, 0), 2),
         '값이 던질 때 나는지 꺼낼 때 나는지',
         '"값은 던질 때" 가정이 흔들린다'
  FROM stats
  UNION ALL
  SELECT 4, '0건 비율',
         round(zero_result_searches::numeric / nullif(total_searches, 0), 2),
         '못 찾는 빈도',
         '재현율 문제. 0건 쿼리를 읽고 정리가 버렸는지 임베딩이 못 잡았는지 가른다'
  FROM stats
  UNION ALL
  SELECT 5, '원문 보기', total_source_views::numeric,
         'mcp_tool_calls(tool=get_source) 행 수', NULL
  FROM stats
  UNION ALL
  SELECT 6, '원문 보기 / 꺼내기',
         round(total_source_views::numeric / nullif(total_searches, 0), 2),
         '다이제스트만으론 부족한 정도',
         '정리 프롬프트를 손보거나 다이제스트에 더 담는다'
  FROM stats
  UNION ALL
  SELECT 7, '평균 최고점수', round(avg_top_score::numeric, 2),
         '검색이 얼마나 확신하나',
         '(낮아지면) 임베딩 텍스트 조립을 다시 본다'
  FROM stats
)
SELECT metric, value, description, direction FROM rows ORDER BY sort_order;

COMMENT ON VIEW v_metrics_summary IS
  'MVP 검증용 요약 지표. "값이 있다"는 아직 증명 못 하는 표본이라, 대신 "값이 없다"가
   즉시 드러나게 하는 게 목적이다. 지표마다 한 행 — 뜻·방향은 컬럼에 있고 경계값은
   없다(threshold는 v_search_results 라벨링으로 나중에 정한다).';
COMMENT ON COLUMN v_metrics_summary.value IS
  '"꺼내기 / 던지기"·"원문 보기 / 꺼내기"는 분모(총 던지기 = sources 전체 행 수)에
   이 로그가 생기기 전에 만들어진 원문도 섞여 있다 — 로그 도입 초기 며칠은 그만큼
   낮게 왜곡될 수 있다. 표본이 쌓일수록(분자가 늘수록) 왜곡 비중은 줄어든다.';

-- =============================================================
-- v_search_log — 꺼내기 한 건씩. date_trunc로 group by 하면 습관이 붙는지 보이고,
-- result_count=0으로 거르면 못 찾은 쿼리만 남는다.
-- =============================================================

CREATE VIEW v_search_log WITH (security_invoker = true) AS
SELECT
  created_at AS occurred_at,
  detail->>'query' AS query,
  jsonb_array_length(detail->'results') AS result_count,
  (
    SELECT max((r->>'score')::double precision)
    FROM jsonb_array_elements(detail->'results') r
  ) AS top_score,
  (
    SELECT min((r->>'score')::double precision)
    FROM jsonb_array_elements(detail->'results') r
  ) AS lowest_score
FROM mcp_tool_calls
WHERE tool = 'search_digests';

COMMENT ON VIEW v_search_log IS
  '꺼내기 한 건씩. result_count=0으로 거르면 못 찾은 쿼리만 모인다. occurred_at으로
   group by 하면 추이가 나온다(습관이 붙는지).';
COMMENT ON COLUMN v_search_log.result_count IS
  '이 쿼리가 실제로 돌려받은 결과 개수(요청 limit이 아니라 반환된 것). 0이면
   재현율 문제 후보.';
COMMENT ON COLUMN v_search_log.top_score IS
  '이 쿼리가 찾은 가장 가까운 결과의 점수. 낮게만 깔리면 임베딩 텍스트를 의심한다.';
COMMENT ON COLUMN v_search_log.lowest_score IS
  '이 쿼리가 찾은 결과 중 가장 먼 것의 점수. top_score와 벌어질수록 결과 안에서도
   확신 편차가 크다는 뜻.';

-- =============================================================
-- v_search_results — threshold 라벨링용. results 배열을 WITH ORDINALITY로
-- 펼쳐 순위를 뽑고, digestId로 digests를 조인해 제목과 유형을 붙인다. 이미 지워진
-- 다이제스트를 가리키는 옛 로그 행도 남아야 하므로 LEFT JOIN이다.
-- =============================================================

CREATE VIEW v_search_results WITH (security_invoker = true) AS
SELECT
  c.created_at AS occurred_at,
  c.detail->>'query' AS query,
  r.ordinality AS rank,
  (r.elem->>'score')::double precision AS score,
  d.title AS digest_title,
  d.type AS digest_type
FROM mcp_tool_calls c
CROSS JOIN LATERAL jsonb_array_elements(c.detail->'results') WITH ORDINALITY AS r(elem, ordinality)
LEFT JOIN digests d ON d.id = (r.elem->>'digestId')::uuid
WHERE c.tool = 'search_digests';

COMMENT ON VIEW v_search_results IS
  'threshold 라벨링용. 순위와 점수를 보며 맞음/틀림을 표시해 경계를 찾는다. 조인을
   매번 손으로 짜지 않게 하는 게 목적 — 라벨 컬럼은 아직 없다(라벨을 어디 남길지는
   실제로 라벨링할 때 정하기로 함).';
COMMENT ON COLUMN v_search_results.rank IS
  '이 쿼리의 결과 배열 안에서의 순서(1이 가장 가까움). 벡터 검색이 찾은 전체 hits가
   아니라 실제로 반환된 것만 대상 — 반환 전 단계에서 걸러진 결과는 여기 없다.';
COMMENT ON COLUMN v_search_results.score IS
  '이 결과의 유사도 점수. 순위와 함께 보며 맞음/틀림을 매겨 score threshold 경계를
   찾는 라벨링 재료.';
