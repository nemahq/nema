-- save_jobs: 비동기 저장 큐 상태 관리

CREATE TYPE save_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE save_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  draft_body    text NOT NULL,
  status        save_job_status NOT NULL DEFAULT 'pending',
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_save_jobs_user_status ON save_jobs (user_id, status);
CREATE INDEX idx_save_jobs_user_recent ON save_jobs (user_id, created_at DESC);

CREATE TRIGGER trg_save_jobs_updated_at
  BEFORE UPDATE ON save_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE save_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "save_jobs_owner" ON save_jobs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 서버 부팅 시 stale job 일괄 실패 처리 (service_role 전용)
CREATE OR REPLACE FUNCTION fail_stale_save_jobs()
RETURNS int AS $$
DECLARE
  affected int;
BEGIN
  UPDATE save_jobs
  SET status = 'failed',
      error_message = 'Server restarted during processing'
  WHERE status IN ('pending', 'processing');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fail_stale_save_jobs FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fail_stale_save_jobs TO service_role;
