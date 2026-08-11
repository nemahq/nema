-- =============================================================
-- statement-generation 슬라이스: statements 신설
--
-- 다이제스트마다 그 유형의 주된 칸을 혼자 읽히는 문장으로 만들어 저장한다
-- (docs/blueprints/first-product/engine/linking.md 2.2). 이번 스코프는 진술
-- 만들기까지다 — 후보 검색·거르기·판정·관계 저장·임베딩은 다음 순서.
-- =============================================================

-- 다이제스트 유형의 주된 칸 이름. 다섯 유형과 1:1 대응이라 칸만 알면 유형도
-- 정해진다(linking.md 2.2 "진술이 들고 있는 것") — 그래서 statements에 별도
-- digest_type 컬럼을 두지 않는다.
CREATE TYPE digest_field AS ENUM ('choice', 'question', 'finding', 'concept', 'assumption');

-- Digest와 마찬가지로 확정 후 불변이라 updated_at이 없다. digest_id UNIQUE —
-- 다이제스트 하나에 진술 하나(linking.md 2.2 "다이제스트 유형마다 주된 칸
-- 하나씩이다"). 칸을 더 뽑게 되면 그때 이 제약을 마이그레이션으로 푼다.
CREATE TABLE statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id     uuid NOT NULL UNIQUE REFERENCES digests(id) ON DELETE CASCADE,
  digest_field  digest_field NOT NULL,
  content       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- RLS — owner-only. statements는 자기 user_id가 없어 digests와 같은 결로
-- (digest_id → source_id → user_id) 조인해 소유를 잰다.
-- =============================================================

ALTER TABLE statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statements_owner_select" ON statements
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM digests
      JOIN sources ON sources.id = digests.source_id
      WHERE digests.id = statements.digest_id AND sources.user_id = (select auth.uid())
    )
  );

CREATE POLICY "statements_owner_insert" ON statements
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM digests
      JOIN sources ON sources.id = digests.source_id
      WHERE digests.id = statements.digest_id AND sources.user_id = (select auth.uid())
    )
  );

-- 앱 코드가 직접 지우진 않지만, 재추출의 digests DELETE가 CASCADE로 여기까지
-- 번질 때도 RLS 아래에서 돈다 — digests_owner_delete와 같은 이유로 필요하다.
CREATE POLICY "statements_owner_delete" ON statements
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM digests
      JOIN sources ON sources.id = digests.source_id
      WHERE digests.id = statements.digest_id AND sources.user_id = (select auth.uid())
    )
  );
