-- =============================================================
-- 관계 엔진 2/3: 스키마 — 잇기 상태 컬럼 + relation 변경셋 무결성 +
--                연쇄 archive 트리거 + 관계 중복 방지 unique
--
-- relation-design §3(잇기 상태)·§6(relation 변경셋)·§7(저장·상태 동작).
-- schema-design이 "엔진 단계로 미룬" 둘(끝점 archived 연쇄 archive 트리거,
-- (from_id,to_id,type) unique)을 여기서 당긴다(relation-design §7).
-- =============================================================

-- =============================================================
-- 1) 잇기 상태 — sources에 세 번째 작업 단계 컬럼 (추출·임베딩과 대칭)
--    sources.extraction_status(①) / statements.ingestion_status(②) /
--    sources.linking_status(③, 신규). 각 상태는 자기 단계만 안다 — 단계 사이
--    순서는 ③의 인출 조건이 표현한다(relation-design §3).
-- =============================================================

ALTER TABLE sources
  ADD COLUMN linking_status       ingestion_status NOT NULL DEFAULT 'pending',
  ADD COLUMN linking_retry_count  int NOT NULL DEFAULT 0,
  ADD COLUMN last_linking_attempt timestamptz;

-- error_message는 추출과 공유한다 — 잇기는 추출 성공 이후에만 도므로(인출 조건이
-- extraction completed를 요구) 추출이 비운 error_message를 잇기가 덮어쓴다. 별도
-- 컬럼을 두지 않는 이유: 한 시점에 한 단계의 실패만 유효하다.

-- 잇기 worker 폴링 (추출 idx_sources_pending과 대칭)
CREATE INDEX idx_sources_linking_pending ON sources (id) WHERE linking_status = 'pending';

-- =============================================================
-- 2) relation 변경셋 무결성 — chk_changeset_shape에 'relation' 분기 추가
--    type='relation'은 source_id 필수("어느 글의 저장이 방아쇠였나")·
--    reverts_id 없음·author_id 없음(엔진 산물) (relation-design §6).
-- =============================================================

ALTER TABLE changesets DROP CONSTRAINT chk_changeset_shape;

ALTER TABLE changesets ADD CONSTRAINT chk_changeset_shape CHECK (
  (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
  (type = 'relation'  AND source_id IS NOT NULL AND reverts_id IS NULL AND author_id IS NULL) OR
  (type = 'revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
  (type = 'manual'    AND source_id IS NULL AND reverts_id IS NULL) OR
  (type IN ('conflict', 'merge') AND source_id IS NULL AND reverts_id IS NULL AND author_id IS NULL)
);

-- =============================================================
-- 3) 끝점 진술 archived → 걸린 관계 연쇄 archive (되살리면 복귀)
--    schema가 엔진 단계로 미룬 트리거 (relation-design §7).
--    첫 출시엔 진술 빼기 흐름이 미구현이라 실제로 안 도나, 빼기·되돌리기가
--    landing할 때를 위한 방어 인프라로 지금 박는다.
-- =============================================================

CREATE OR REPLACE FUNCTION cascade_archive_statement_relations()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'archived' THEN
    -- 끝점이 가려지면 그 끝점에 걸린 active 관계를 함께 가린다
    UPDATE statement_relations
    SET status = 'archived'
    WHERE status = 'active' AND (from_id = NEW.id OR to_id = NEW.id);
  ELSE
    -- 끝점이 되살아나면, 양끝이 다 active인 관계만 복귀시킨다 —
    -- 한쪽 끝이 아직 가려져 있으면 관계도 가린 채로 둔다.
    UPDATE statement_relations r
    SET status = 'active'
    WHERE r.status = 'archived'
      AND (r.from_id = NEW.id OR r.to_id = NEW.id)
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.from_id AND s.status = 'active')
      AND EXISTS (SELECT 1 FROM statements s WHERE s.id = r.to_id   AND s.status = 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_statements_cascade_archive_relations
  AFTER UPDATE OF status ON statements
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION cascade_archive_statement_relations();

-- =============================================================
-- 4) (from_id, to_id, type) 중복 방지 unique
--    재시도가 같은 관계를 이중 적용하는 것을 막는다 (relation-design §7).
--    상태 무관 전체 유니크 — 가려진 관계의 재생성도 막고, 연쇄 복귀는 기존 행을
--    UPDATE하므로 충돌하지 않는다. conflicts의 역방향(B→A) 중복은 이 인덱스가
--    아니라 후보 단계에서 막는다(방향 저장·동작 대칭, schema-design §4.4).
-- =============================================================

CREATE UNIQUE INDEX uq_statement_relations_triple
  ON statement_relations (from_id, to_id, type);
