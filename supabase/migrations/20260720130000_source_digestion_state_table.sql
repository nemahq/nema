-- sources의 재시도 카운터·마지막 시도 시각은 화면에 안 쓰이는 내부 파이프라인
-- 부기(付記)인데, sources와 같은 row에 있어서 워커가 건드릴 때마다 realtime
-- UPDATE 이벤트가 나가 클라이언트의 불필요한 재조회를 유발한다(source.listPending
-- 등). 이 컬럼들을 별도 테이블로 옮겨 realtime publication(sources) 밖에 두면
-- 이 재조회가 원천적으로 사라진다.
--
-- 단계적으로 진행한다 — 이 마이그레이션은 새 테이블 생성 + 백필만 하는 순수 추가라
-- 기존 동작에 영향이 없다. RPC들이 이 테이블을 쓰도록 바꾸는 건 다음 마이그레이션,
-- sources에서 옛 컬럼을 실제로 제거하는 건 그 다음 변경이 스테이징에서 충분히
-- 검증된 뒤 별도로 진행한다.
--
-- digestion_status/extraction_status/linking_status와 last_digestion_attempt는
-- 옮기지 않는다 — listPendingSources/listSources/getSource가 이미 화면에 노출하는
-- 값이라 sources에 남아 있어야 한다.
CREATE TABLE source_digestion_state (
  source_id                uuid PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  extraction_retry_count   int NOT NULL DEFAULT 0,
  last_extraction_attempt  timestamptz,
  digestion_retry_count    int NOT NULL DEFAULT 0,
  linking_retry_count      int NOT NULL DEFAULT 0,
  last_linking_attempt     timestamptz
);

INSERT INTO source_digestion_state (
  source_id, extraction_retry_count, last_extraction_attempt,
  digestion_retry_count, linking_retry_count, last_linking_attempt
)
SELECT id, extraction_retry_count, last_extraction_attempt,
       digestion_retry_count, linking_retry_count, last_linking_attempt
FROM sources;

-- 재시도 카운트·인덱스 관련: 별도 인덱스를 안 둔다. fetch_pending_sources 등의
-- 폴링은 sources 쪽 파티셜 인덱스(idx_sources_pending 등)로 후보를 먼저 좁힌 뒤
-- source_id PK로 이 표를 조인하고, 재시도 카운트·마지막 시도 시각은 그 뒤에
-- 필터로만 걸린다 — 여기에 인덱스를 걸어도 플래너가 access path로 못 씀. 게다가
-- last_*_attempt는 클레임마다 갱신되는 컬럼이라 인덱스가 있으면 HOT update가
-- 막혀 이 PR이 줄이려는 쓰기 비용을 오히려 늘린다.

-- 클라이언트가 직접 읽을 일이 없는 순수 내부 테이블 — RPC(SECURITY DEFINER)만 접근.
-- authenticated에는 아무 권한도 주지 않는다(sources처럼 SELECT조차 열지 않음).
ALTER TABLE source_digestion_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON source_digestion_state TO service_role;
