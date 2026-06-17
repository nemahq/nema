-- =============================================================
-- 사람 개입 2/4: chk_data_by_action에 restore 분기 추가
--
-- restore는 archive의 대칭이라 data가 없다(되살릴 대상은 target_id로 충분).
-- 'restore' 값을 참조하므로 1/4(enum 추가) 이후 별도 트랜잭션이어야 한다
-- (intervention-design §8 D). schema-design 4.3의 chk_data_by_action 수정.
-- =============================================================

ALTER TABLE changes DROP CONSTRAINT chk_data_by_action;

ALTER TABLE changes ADD CONSTRAINT chk_data_by_action CHECK (
  (action IN ('create', 'modify') AND data IS NOT NULL)
  OR (action IN ('archive', 'restore') AND data IS NULL)
);
