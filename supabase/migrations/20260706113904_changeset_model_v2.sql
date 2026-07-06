-- =============================================================
-- 용어 사전 v2 모델링: Changeset 모델 정합 (07-modeling.md)
--
-- 1) changeset_type에서 conflict·merge 제거 — 관계의 종류(conflicts/duplicates)는
--    Relation.type이 이미 구분하므로, changeset 레벨에서 또 나누면 같은 정보를
--    두 군데 적는 중복 축이 된다(문서 세션과 합의). 실제 관계 제안은
--    type='relation' + pending이 그 자리를 이미 맡고 있고, 두 값을 쓰는 코드는
--    어디에도 없다(스키마만 받아둔 상태).
-- 2) change_target_type에 digest·reference 추가 — digests·references 테이블의
--    변경도 Changeset으로 다루기 위한 자리.
-- 3) modify는 reference 전용 — source·digest·statement·relation은 확정 후
--    불변(create/archive/restore만). Reference만 "다듬어지는 것"이 본질이라
--    modify를 쓴다.
-- 4) changesets.space_id nullable — Reference 직접 수정처럼 Workspace 스코프
--    콘텐츠가 대상이면 비운다. (그 경우의 조회 정책은 Reference 수정 흐름
--    구현 때 workspace 기반 정책으로 붙는다 — 현재 NULL 행을 만드는 경로 없음)
--
-- enum 값 제거·추가 모두 타입 재구성으로 처리 — ALTER TYPE ADD VALUE는 같은
-- 트랜잭션에서 그 값을 참조(3의 CHECK)할 수 없지만, 새로 만든 타입은 즉시
-- 참조 가능하다.
-- =============================================================

-- =============================================================
-- 1) changeset_type 재구성 — conflict·merge 제거
--    (해당 값의 행이 있으면 USING 캐스팅이 실패하며 마이그레이션이 멈춘다 —
--     무데이터 전제를 조용히 넘어가지 않게 하는 의도된 동작)
-- =============================================================

ALTER TABLE changesets DROP CONSTRAINT chk_changeset_shape;

ALTER TYPE changeset_type RENAME TO changeset_type_old;
CREATE TYPE changeset_type AS ENUM ('ingestion', 'relation', 'manual', 'revert');

ALTER TABLE changesets ALTER COLUMN type TYPE changeset_type
  USING (type::text::changeset_type);

DROP TYPE changeset_type_old;

-- conflict·merge 분기만 빠진 동일 제약 (20260614072230과 같은 내용)
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_shape CHECK (
  (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
  (type = 'relation'  AND source_id IS NOT NULL AND reverts_id IS NULL AND author_id IS NULL) OR
  (type = 'revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
  (type = 'manual'    AND source_id IS NULL AND reverts_id IS NULL)
);

-- =============================================================
-- 2) change_target_type 재구성 — digest·reference 추가
-- =============================================================

ALTER TABLE changes DROP CONSTRAINT chk_no_source_modify;

ALTER TYPE change_target_type RENAME TO change_target_type_old;
CREATE TYPE change_target_type AS ENUM ('statement', 'relation', 'source', 'digest', 'reference');

ALTER TABLE changes ALTER COLUMN target_type TYPE change_target_type
  USING (target_type::text::change_target_type);

DROP TYPE change_target_type_old;

-- =============================================================
-- 3) modify는 reference 전용 (chk_no_source_modify를 일반화해 대체)
-- =============================================================

ALTER TABLE changes ADD CONSTRAINT chk_modify_only_reference CHECK (
  NOT (action = 'modify' AND target_type <> 'reference')
);

-- =============================================================
-- 4) changesets.space_id nullable
-- =============================================================

ALTER TABLE changesets ALTER COLUMN space_id DROP NOT NULL;
