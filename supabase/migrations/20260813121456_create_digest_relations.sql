-- =============================================================
-- digest-relations 슬라이스: digest_relations·relation_judgments 신설
--
-- 다이제스트끼리 관계를 잇는다. 이번엔 지지·약화 둘뿐이다 — 이 둘만 아무것도 접지
-- 않아 사람의 리뷰 없이 엔진이 그냥 이을 수 있다(engine/linking.md 2.3, 2.7).
-- 중복·충돌·해소는 확정하면 뭔가 접히므로 리뷰 화면과 함께 다음 순서다.
--
-- 관계는 진술이 아니라 다이제스트끼리 건다(statements는 20260813013814에서 폐기).
-- =============================================================

CREATE TYPE digest_relation_type AS ENUM ('support', 'weaken');

-- from이 하는 쪽, to가 받는 쪽. 지지·약화는 받는 쪽이 늘 결정이라 방향이 대부분
-- 유형에서 나오고, 둘 다 결정일 때만 판정 LLM이 답한다(linking.md 2.7).
-- digests와 마찬가지로 확정 후 불변이라 updated_at이 없다 — 관계를 고치는 길은
-- 지우고 다시 잇는 것뿐이다. user_id도 없다: 소유는 양 끝 digest → source 조인으로
-- 판정한다(아래 RLS).
CREATE TABLE digest_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_digest_id  uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  to_digest_id    uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  type            digest_relation_type NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digest_relations_not_self CHECK (from_digest_id <> to_digest_id)
);

-- 한 쌍에 관계는 하나. 방향을 무시하고(LEAST/GREATEST) 거는 게 핵심이다 — 지지와
-- 약화는 서로 반대 방향이라 같은 쌍에 동시에 참일 수 없는데(linking.md 2.7),
-- (from, to) 순서쌍에 걸면 A→B 지지와 B→A 약화가 서로 다른 행이라 둘 다 들어온다.
-- 그 조합이 실제로 생길 수 있는 자리는 동시 던지기다: 두 원문이 겹쳐 들어오면 같은
-- 쌍이 양쪽 판정 대화에서 한 번씩 판정되고, LLM이 비결정적이라 두 답이 어긋날 수 있다.
-- (평소에는 한 쌍이 한 번만 판정된다 — 같은 원문 안은 앞선 것만 후보로 보고, 기존
-- 다이제스트는 판정 대화가 다시 안 열린다.)
-- 쓰기 쪽은 이 충돌을 건너뛰고 먼저 이어진 것을 남긴다(digest-relation-service).
CREATE UNIQUE INDEX digest_relations_unique_pair ON digest_relations (
  LEAST(from_digest_id, to_digest_id),
  GREATEST(from_digest_id, to_digest_id)
);

COMMENT ON TABLE digest_relations IS
  '다이제스트 사이의 방향 있는 관계. from이 하는 쪽, to가 받는 쪽 —
   "from이 to를 지지/약화한다"로 읽는다. 지지·약화는 아무것도 접지 않아
   사람의 확정 없이 엔진이 바로 잇는다.';

-- 관련 목록은 양쪽 끝에서 다 뜬다(linking.md 2.3) — 어느 끝으로 물어도 인덱스를 탄다.
CREATE INDEX idx_digest_relations_from ON digest_relations (from_digest_id);
CREATE INDEX idx_digest_relations_to ON digest_relations (to_digest_id);

-- =============================================================
-- relation_judgments — 판정에 넘긴 후보와 그때 유사도 점수, 그리고 판정 결과.
--
-- 후보 상한과 유사도 문턱은 지금 실측 근거 없이 정한 값이다. 그 값을 나중에 정하려면
-- "몇 점짜리 후보가 실제로 관계였나"가 필요한데, digest_relations에는 관계가 된 것만
-- 남아 떨어진 후보의 점수가 안 남는다. 그 재료를 남기는 자리다.
--
-- mcp_tool_calls의 두 규칙을 그대로 적용했다: ① DB에 이미 있는 값은 안 담고(관계가
-- 몇 개 잡혔나는 digest_relations가 답한다) ② 나중에 다시 잴 수 있는 값(소요 시간)도
-- 안 담는다. 후보 점수와 판정 결과는 둘 다에 안 걸린다 — 그때의 재고와 LLM 판정은
-- 지나가면 다시 못 만든다.
-- =============================================================

CREATE TABLE relation_judgments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- FK를 안 건다 — 재추출·삭제로 다이제스트가 없어져도 그때 무엇이 후보였는지는
  -- 남아야 한다(mcp_tool_calls가 detail 안에 digestId를 담아둔 것과 같은 이유).
  digest_id   uuid NOT NULL,
  candidates  jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relation_judgments_candidates_shape
    CHECK (jsonb_typeof(candidates) = 'array')
);

COMMENT ON TABLE relation_judgments IS
  '관계 판정 한 건씩(다이제스트 하나 = LLM 1콜 = 1행). candidates는
   [{ digestId, score, verdict }] — score는 판정에 넘길 때의 벡터 유사도,
   verdict는 판정 결과(관계 종류 또는 none)다. 후보가 0개면 LLM을 안 부르므로
   행도 안 생긴다.';

CREATE INDEX idx_relation_judgments_user_created
  ON relation_judgments (user_id, created_at DESC);

-- =============================================================
-- v_relation_candidates — 문턱·상한을 정할 때 볼 표. candidates 배열을 펼쳐
-- 점수 내림차순 순위를 붙이고, 양쪽 다이제스트의 제목·유형을 조인한다.
-- 이미 지워진 다이제스트를 가리키는 옛 행도 남아야 하므로 LEFT JOIN이다.
-- v_search_results와 같은 자리·같은 목적(라벨링 재료)이다.
-- =============================================================

CREATE VIEW v_relation_candidates WITH (security_invoker = true) AS
SELECT
  j.created_at AS occurred_at,
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
   rank 끝자리까지 관계가 붙으면 상한이 낮은 것이다.';
COMMENT ON COLUMN v_relation_candidates.rank IS
  '이 판정의 후보 배열 안에서의 순서(1이 뜻으로 가장 가까움). 상한에 걸려 잘려나간
   후보는 여기 없다 — 판정에 실제로 넘어간 것만 남는다.';

-- =============================================================
-- RLS — digest_relations는 양 끝이 모두 내 것일 때만 보이고 써진다. 한쪽만 재면
-- 남의 다이제스트를 끝에 매단 행을 만들 수 있고, 그 행이 내 관련 목록에 남의
-- digest_id를 실어 나른다.
-- relation_judgments는 mcp_tool_calls와 같은 결 — 서버가 스스로 남기는 기록이라
-- 읽기만 owner-only로 열고 쓰기 정책은 아예 안 연다(서비스가 admin으로 쓴다).
-- =============================================================

ALTER TABLE digest_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE relation_judgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digest_relations_owner_select" ON digest_relations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM digests d
      JOIN sources s ON s.id = d.source_id
      WHERE d.id = digest_relations.from_digest_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM digests d
      JOIN sources s ON s.id = d.source_id
      WHERE d.id = digest_relations.to_digest_id AND s.user_id = (select auth.uid())
    )
  );

CREATE POLICY "digest_relations_owner_insert" ON digest_relations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM digests d
      JOIN sources s ON s.id = d.source_id
      WHERE d.id = digest_relations.from_digest_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM digests d
      JOIN sources s ON s.id = d.source_id
      WHERE d.id = digest_relations.to_digest_id AND s.user_id = (select auth.uid())
    )
  );

-- 앱이 관계를 직접 지우진 않지만, 재추출·삭제의 digests DELETE가 CASCADE로 여기까지
-- 번질 때도 RLS 아래에서 돈다 — digests_owner_delete와 같은 이유로 필요하다.
CREATE POLICY "digest_relations_owner_delete" ON digest_relations
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM digests d
      JOIN sources s ON s.id = d.source_id
      WHERE d.id = digest_relations.from_digest_id AND s.user_id = (select auth.uid())
    )
  );

CREATE POLICY "relation_judgments_owner_select" ON relation_judgments
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
