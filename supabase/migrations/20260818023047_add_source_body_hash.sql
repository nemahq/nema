-- =============================================================
-- 던지기 중복 방지 지문 — 타임아웃 후 재시도가 같은 원문을 두 번 넣는 문제를
-- 막는다.
--
-- 완전한 unique 제약은 안 쓴다 — 같은 내용을 의도적으로 다시 던지는 경우를
-- 영구히 막게 된다. 대신 서비스 계층(source-service.ts)이 짧은 시간 창 안에서만
-- 같은 user_id + body_hash 일치를 중복으로 본다. 이 컬럼은 그 조회를 빠르게
-- 하는 지문일 뿐 유일성 제약의 근거가 아니다.
--
-- 전문(body) 비교 대신 해시로 견주는 이유는 조회 비용 — 보안 용도가 아니라
-- 같은 문자열인지만 가늠하면 되므로 pgcrypto 확장 없이 코어 함수인 md5로
-- 충분하다.
-- =============================================================

ALTER TABLE sources
  ADD COLUMN body_hash text GENERATED ALWAYS AS (md5(body)) STORED NOT NULL;

COMMENT ON COLUMN sources.body_hash IS
  '중복 던지기 판정용 지문(md5(body)). 유일성을 강제하지 않는다 — 서비스
   계층(source-service.ts의 던지기 중복 판정 로직)이 짧은 시간 창 안에서만
   user_id + body_hash 일치를 중복으로 본다.';

-- 최근 중복 조회(user_id + body_hash, 최신순) 경로.
CREATE INDEX idx_sources_user_body_hash_created
  ON sources (user_id, body_hash, created_at DESC);

-- CREATE OR REPLACE VIEW은 기존 컬럼 순서를 못 바꾼다 — 새 컬럼은 끝에 붙인다.
-- 중복 조회가 v_visible_sources를 거쳐야(다른 뷰들과 같은 관례) 휴지통에 간
-- 원문은 중복 대상에서 자연히 빠진다 — 되돌려줄 결과가 이미 없기 때문이다.
CREATE OR REPLACE VIEW v_visible_sources WITH (security_invoker = true) AS
SELECT
  s.id, s.user_id, s.name, s.title, s.body, s.body_preview,
  s.digestion_status, s.public_id, s.created_at, s.updated_at, s.body_hash
FROM sources s
WHERE s.trashed_at IS NULL;
