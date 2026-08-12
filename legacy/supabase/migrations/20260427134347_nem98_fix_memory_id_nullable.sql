-- ON DELETE SET NULL이 동작하려면 memory_id가 nullable이어야 함.
-- 앞선 마이그레이션에서 DROP NOT NULL이 누락되어 보정.
ALTER TABLE memory_revisions ALTER COLUMN memory_id DROP NOT NULL;
