-- =============================================================
-- statement_type — todo 값 제거
--
-- todo를 Statement 하위 타입으로 되살리지 않기로 확정했다(07-modeling.md
-- Statement.type은 이미 `claim / question`만 남도록 문서가 정리돼 있었다).
-- 진술은 항상 Digest의 타입별 칸(decision/pending/learning/idea/assumption,
-- packages/shared/src/schemas/digest.ts DIGEST_TYPES)에서만 추출되는데, 다섯
-- 타입 어디에도 할 일(작업/액션) 칸이 없어 이번 결정 이후로는 todo로 뽑힐
-- 추출 경로가 없다 — 되살리는 대신 걷어낸다.
--
-- 주의: "지금까지 한 번도 없었다"가 아니라 "앞으로는 없다"다 — 이 PR 직전까지
-- digest-extraction.ts 프롬프트가 실제로 "todo"를 유효 값으로 LLM에 제시하고
-- 있었으므로(같은 PR에서 함께 제거), 과거 추출 결과에 todo row가 실제로 남아있을
-- 가능성을 배제할 수 없다. 로컬 DB에서 0건을 확인했지만 로컬은 비어있는 상태라
-- 그 확인 자체가 스테이징·프로덕션에 대해 아무것도 보증하지 않는다 — 그래서
-- 아래에서 배포 시점에 남아있을 수 있는 todo row를 자동으로 claim/certain으로
-- 백필하고 넘어간다(하드 실패 대신 자기치유). "의도를 나타내는 진술은 claim"이라는
-- statement-extraction.ts/digest-extraction.ts의 새 분류 규칙과 같은 방향이라
-- 데이터를 잃지 않는다.
--
-- Postgres는 enum에서 값을 직접 못 뺀다(ALTER TYPE ... DROP VALUE 없음) — 새
-- 타입을 만들어 컬럼을 옮기고 옛 타입을 지우는 표준 패턴을 쓴다.
--
-- chk_confidence_only_claim과 fetch_pending_statements(RETURNS TABLE의 한 컬럼이
-- statement_type)이 컬럼·타입을 직접 참조해 ALTER COLUMN TYPE 전에 걷어내야 한다
-- (재생성 시 새 타입을 그대로 다시 참조).
-- =============================================================

BEGIN;

-- 백필 — 남아있을 수 있는 todo row를 claim/certain으로 자동 전환(자기치유).
-- confidence를 같이 채우는 이유는 chk_confidence_only_claim이 claim⟺confidence
-- NOT NULL을 요구해서다(todo는 지금까지 confidence가 항상 NULL).
UPDATE statements SET type = 'claim', confidence = 'certain' WHERE type = 'todo';

ALTER TABLE statements DROP CONSTRAINT chk_confidence_only_claim;

DROP FUNCTION fetch_pending_statements(integer);

ALTER TYPE statement_type RENAME TO statement_type_old;

CREATE TYPE statement_type AS ENUM ('claim', 'question');

ALTER TABLE statements
  ALTER COLUMN type TYPE statement_type USING type::text::statement_type;

DROP TYPE statement_type_old;

ALTER TABLE statements ADD CONSTRAINT chk_confidence_only_claim CHECK (
  (type = 'claim' AND confidence IS NOT NULL)
  OR (type <> 'claim' AND confidence IS NULL)
);

-- fetch_pending_statements — 함수의 최신 정의를 그대로 복원(20260611091643 이후 본문
-- 변경 없음, pg_get_functiondef로 확인). 반환 컬럼 type만 새 statement_type을 잡는다.
CREATE FUNCTION fetch_pending_statements(p_max_retries int DEFAULT 5)
RETURNS TABLE(
  id         uuid,
  space_id   uuid,
  content    text,
  type       statement_type,
  confidence statement_confidence,
  status     statement_status,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE statements st
  SET last_ingestion_attempt = now()
  FROM (
    SELECT st2.id
    FROM statements st2
    WHERE st2.ingestion_status = 'pending'
      AND st2.ingestion_retry_count < p_max_retries
      AND (st2.last_ingestion_attempt IS NULL
           OR st2.last_ingestion_attempt + (st2.ingestion_retry_count + 1) * interval '30 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE st.id = picked.id
  RETURNING st.id, st.space_id, st.content, st.type, st.confidence, st.status, st.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fetch_pending_statements FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_statements TO service_role;

COMMIT;
