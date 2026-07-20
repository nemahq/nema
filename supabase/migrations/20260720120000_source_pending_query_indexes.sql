-- source.listPending 조회가 sources.status, changesets.source_id 조건에 인덱스가 없어
-- 매번 풀스캔되던 문제 수정 — workspace 전체 sources를 status만으로 훑고, 반환된
-- source들의 changesets를 source_id로 다시 훑는 두 쿼리 모두 인덱스 부재였음.

CREATE INDEX idx_sources_status_created
  ON sources (status, created_at DESC);

CREATE INDEX idx_changesets_source_type_status
  ON changesets (source_id, type, status)
  WHERE source_id IS NOT NULL;
