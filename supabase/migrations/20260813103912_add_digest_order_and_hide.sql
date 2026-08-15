-- =============================================================
-- 다이제스트 화면 슬라이스: 목록 정렬용 추출 순서 칸과 삭제(가림) 칸을 더한다.
--
-- 가림(hidden_at)만 두고 실제로 지우지 않는 이유는 몇 개를 걷어냈는지가 정리
-- 품질 지표로 남아야 해서다 — Postgres 행은 살아 있지만 화면에는 안 보인다.
-- 되살리는 화면은 없다(사용자에게는 영구 삭제로 보인다). 벡터(Qdrant)는 가림과
-- 별도로 실제 삭제한다 — 가리기만 하면 검색에 계속 걸린다.
--
-- 가림이 생기며 digests 행이 더는 불변이 아니다(원 마이그레이션 주석 "확정 후
-- 불변"을 정정) — 관례대로 updated_at·트리거를 같이 추가한다.
-- =============================================================

ALTER TABLE digests
  ADD COLUMN extraction_order integer NOT NULL DEFAULT 0,
  ADD COLUMN hidden_at        timestamptz,
  ADD COLUMN updated_at       timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN digests.extraction_order IS
  '원문 안에서의 추출 순서(0부터). LLM 응답 배열의 순서를 그대로 담는다 — saveDigests
   참고. 목록 화면이 원문 안 정렬에 쓴다.';
COMMENT ON COLUMN digests.hidden_at IS
  '삭제 표시 — NULL이면 살아있음. 이름을 "deleted_at"이 아니라 "hidden_at"으로 둔
   건 Postgres 행은 남기고 표시만 하는 가림이라서다(digest.delete 참고).';

CREATE TRIGGER trg_digests_updated_at
  BEFORE UPDATE ON digests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 기존 행 백필: created_at, id 순으로 순서를 매긴다. 한 번에 insert돼서
-- created_at이 같고 그 안의 id 순서는 임의라, 원래 추출 순서와 다를 수 있다.
-- 복원할 방법이 없어 감수한다 — staging 데이터뿐이라 감수하기로 했고, 화면이
-- 실제로 쓰이기 시작하는 이후 저장분은 정확하다.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY source_id ORDER BY created_at, id
  ) - 1 AS rn
  FROM digests
)
UPDATE digests
SET extraction_order = ordered.rn
FROM ordered
WHERE digests.id = ordered.id;

-- 백필 이후로는 저장 경로(saveDigests)가 항상 명시적으로 순서를 넣는다 — 값이
-- 빠지는 실수를 기본값으로 조용히 감추지 않는다.
ALTER TABLE digests ALTER COLUMN extraction_order DROP DEFAULT;

-- 원문 안에서의 정렬 조회 경로(목록 화면)이자, 같은 원문 안 중복 순서를 막는
-- 정합성 제약.
CREATE UNIQUE INDEX idx_digests_source_order ON digests (source_id, extraction_order);

-- 삭제 표시를 남기려면 UPDATE 권한이 필요하다(지금까지 SELECT·INSERT·DELETE뿐).
CREATE POLICY "digests_owner_update" ON digests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = digests.source_id AND sources.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = digests.source_id AND sources.user_id = (select auth.uid())
    )
  );
