-- =============================================================
-- 중복·충돌 관계를 더한다.
--
-- 지지·약화와 같은 자리에 같은 모양으로 들어간다 — 아무것도 접지 않고 조용히
-- 걸리기만 하므로 리뷰·확정·병합을 위한 컬럼이 붙지 않는다(engine/linking.md 2.4~2.5는
-- "사람이 판정하고 한쪽이 접힌다"를 전제로 쓰인 절이라 아직 범위 밖이다).
--
-- 해소(resolves)는 여기 없다. 미결이 쌓여야 값이 생기는데 지금은 쌓인 게 없다.
-- =============================================================

ALTER TYPE digest_relation_type ADD VALUE 'duplicate';
ALTER TYPE digest_relation_type ADD VALUE 'conflict';

-- digest_relations_unique_pair는 그대로 둔다 — 한 쌍에 관계는 여전히 하나다.
-- 다른 원문의 결정↔결정은 지지·약화와 중복·충돌 두 판정 모두의 후보라 weaken과
-- conflict가 같은 쌍에 함께 나올 수 있는데, 관련 목록에 "충돌한다"와 "약화한다"가
-- 나란히 뜨면 같은 사실을 두 번 말하는 꼴이다. 쌍당 하나만 남기고, 어느 쪽이
-- 남을지는 판정 순서로 정한다(source-service가 중복·충돌을 먼저 돌린다).

-- =============================================================
-- relation_judgments.judgment — 이 판정이 어느 갈래였나.
--
-- 문턱·상한은 아직 갈래를 안 나누고 한 벌을 쓴다. 나중에 나누려면 "몇 점짜리가
-- 실제로 관계였나"를 갈래별로 봐야 하는데, 그 재료가 되는 verdict 대부분은 none이라
-- 갈래 표시가 없으면 두 분포가 한 덩어리로 섞인다. 후보 범위가 서로 달라서
-- (중복·충돌은 같은 원문 안을 아예 안 본다) 애초에 다른 분포가 나온다.
-- =============================================================

ALTER TABLE relation_judgments ADD COLUMN judgment text;

-- 이 컬럼이 생기기 전의 행은 전부 지지·약화 판정이었다.
UPDATE relation_judgments SET judgment = 'support_weaken' WHERE judgment IS NULL;

ALTER TABLE relation_judgments ALTER COLUMN judgment SET NOT NULL;

COMMENT ON COLUMN relation_judgments.judgment IS
  '이 판정이 물은 질문 묶음(= 갈래). support_weaken | duplicate_conflict —
   relation-rules.ts의 RelationJudgment.name과 같은 값이다. 한 다이제스트는
   갈래마다 한 행씩 남는다.';

-- 뷰에도 실어 갈래별로 갈라 볼 수 있게 한다. security_invoker·LEFT JOIN 등
-- 나머지는 20260813121456의 정의 그대로다.
DROP VIEW v_relation_candidates;

CREATE VIEW v_relation_candidates WITH (security_invoker = true) AS
SELECT
  j.created_at AS occurred_at,
  j.judgment,
  d.title AS digest_title,
  d.type AS digest_type,
  c.ordinality AS rank,
  (c.elem->>'score')::double precision AS score,
  c.elem->>'verdict' AS verdict,
  cd.title AS candidate_title,
  cd.type AS candidate_type
FROM relation_judgments j
CROSS JOIN LATERAL jsonb_array_elements(j.candidates) WITH ORDINALITY AS c(elem, ordinality)
LEFT JOIN digests d ON d.id = j.digest_id
LEFT JOIN digests cd ON cd.id = (c.elem->>'digestId')::uuid;

COMMENT ON VIEW v_relation_candidates IS
  '판정에 넘어간 후보를 한 줄씩. score와 verdict를 나란히 보며 "몇 점부터 실제로
   관계였나"를 읽어 문턱·상한을 정한다. verdict가 none으로만 깔리면 문턱이 낮고,
   rank 끝자리까지 관계가 붙으면 상한이 낮은 것이다. judgment로 갈래를 갈라 본다 —
   후보 범위가 달라 두 갈래의 점수 분포는 서로 다르다.';
COMMENT ON COLUMN v_relation_candidates.rank IS
  '이 판정의 후보 배열 안에서의 순서(1이 뜻으로 가장 가까움). 상한에 걸려 잘려나간
   후보는 여기 없다 — 판정에 실제로 넘어간 것만 남는다.';
