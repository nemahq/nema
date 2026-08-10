-- save_jobs.draft_body nullability가 status 전이와 일관되도록 제약.
-- completed 외 상태(pending/processing/failed)에서는 원문이 반드시 보존되어야 재처리 가능.
ALTER TABLE save_jobs
  ADD CONSTRAINT chk_save_jobs_body_lifecycle
  CHECK (status = 'completed' OR draft_body IS NOT NULL);
