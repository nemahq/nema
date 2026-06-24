-- =============================================================
-- eval_runs — 모델 가성비 측정 이력 (NEM-149, A=예측·실험실).
-- 한 행 = 한 (모델 × 기능) 측정. 공통 4컬럼(model·task·cost_usd·latency_ms)은
-- 실트래픽 원가(B)가 미러할 규약 — "예측(A) vs 실제(B)" 비교가 컬럼 정렬로 성립한다.
-- 비용·지연은 동작당(호출당) 평균. 세부 신호(토큰·품질 분해)는 signals jsonb.
-- service-role 전용: eval 스크립트가 staging에 적재하며 클라이언트는 접근하지 않는다.
-- =============================================================

CREATE TABLE eval_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at          timestamptz NOT NULL,
  model           text NOT NULL,
  provider        text NOT NULL,
  task            text NOT NULL,
  eval_version    text NOT NULL,
  prompt_version  text NOT NULL,
  cost_usd        numeric,
  latency_ms      integer NOT NULL,
  quality_score   numeric,
  self_preference boolean NOT NULL DEFAULT false,
  signals         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 모델 세대·시간 축 추세/회귀 질의 — 기능별로 한 모델을 시간순 비교.
CREATE INDEX idx_eval_runs_task_model_run_at ON eval_runs (task, model, run_at DESC);

-- 클라이언트(anon/authenticated) 접근 차단. service-role은 RLS를 우회해 적재·조회한다.
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;
