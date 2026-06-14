-- =============================================================
-- 관계 엔진 1/3: changeset_type에 'relation' 값 추가
--
-- 관계 감지는 ingestion에 못 탄다 — 시점(임베딩 뒤)·게이트(pending 존재)·
-- 주체(엔진 산물, author 없음)가 모두 달라 별도 type이다 (relation-design §6).
--
-- ALTER TYPE ... ADD VALUE는 같은 트랜잭션에서 그 값을 참조할 수 없으므로
-- (Postgres: "unsafe use of new value"), chk_changeset_shape 수정과 분리해
-- 별도 마이그레이션으로 둔다. 다음 파일에서 'relation' 분기를 CHECK에 박는다.
-- =============================================================

ALTER TYPE changeset_type ADD VALUE IF NOT EXISTS 'relation';
