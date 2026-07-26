-- =============================================================
-- statement_type — todo 값 제거
--
-- todo를 Statement 하위 타입으로 되살리지 않기로 확정했다(07-modeling.md
-- Statement.type은 이미 `claim / question`만 남도록 문서가 정리돼 있었다).
-- 진술은 항상 Digest의 타입별 칸(decision/pending/learning/idea/assumption,
-- packages/shared/src/schemas/digest.ts DIGEST_TYPES)에서만 추출되는데, 다섯
-- 타입 어디에도 할 일(작업/액션) 칸이 없어 todo로 뽑힐 실제 추출 경로 자체가
-- 구조적으로 없다 — 되살리는 대신 걷어낸다.
--
-- Postgres는 enum에서 값을 직접 못 뺀다(ALTER TYPE ... DROP VALUE 없음) — 새
-- 타입을 만들어 컬럼을 옮기고 옛 타입을 지우는 표준 패턴을 쓴다. 사전에
-- statement_type='todo' row가 0건임을 확인했다(추출 경로가 없었으므로 예상대로) —
-- 만에 하나 남아있다면 USING 캐스트가 실패해 마이그레이션 자체가 막힌다(자동
-- 데이터 손실 대신 명시적 실패).
--
-- chk_confidence_only_claim과 fetch_pending_statements(RETURNS TABLE의 한 컬럼이
-- statement_type)이 컬럼·타입을 직접 참조해 ALTER COLUMN TYPE 전에 걷어내야 한다
-- (재생성 시 새 타입을 그대로 다시 참조).
-- =============================================================

BEGIN;

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

-- fetch_pending_statements — statement_type_old의 최신 정의를 그대로 복원(20260611091643
-- 이후 본문 변경 없음, pg_get_functiondef로 확인). 반환 컬럼 type만 새 statement_type을 잡는다.
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
