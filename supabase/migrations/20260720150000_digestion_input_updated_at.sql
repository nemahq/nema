-- 정리(digestion)의 입력이 마지막으로 바뀐 시각.
--
-- "결과없음 초안을 원본 그대로 다시 정리해봐야 또 결과없음"이라 재정리를 막는데,
-- 그 판정에 쓸 신호가 지금까진 없었다. updated_at은 못 쓴다 — 정리 파이프라인이
-- 처리 중 digestion_status·last_digestion_attempt를 여러 번 써서 계속 밀어올리므로
-- 사용자 편집과 구분이 안 된다.
--
-- 입력으로 치는 컬럼은 정리 결과를 바꿀 수 있는 것만이다(digestion.ts 기준):
--   body     — LLM 입력으로 직행
--   space_id — 토픽 레지스트리가 space 범위라, 옮기면 LLM이 보는 토픽이 달라진다
-- title은 파이프라인에 안 들어가므로 제외한다.

ALTER TABLE sources
  ADD COLUMN digestion_input_updated_at timestamptz NOT NULL DEFAULT now();

-- 기존 행은 생성 시각으로 되돌린다 — now()로 두면 이미 정리를 마친 초안까지
-- "정리 이후 입력이 바뀌었다"로 잘못 판정돼 재정리가 일제히 풀린다.
-- 전체 재작성이라 정리 워커의 FOR UPDATE SKIP LOCKED와 부딪힐 수 있지만, 아직
-- sources가 수천 행 규모라 배치 분할 없이 한 번에 간다.
UPDATE sources SET digestion_input_updated_at = created_at;

CREATE OR REPLACE FUNCTION update_digestion_input_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.digestion_input_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- UPDATE OF는 SET 목록에 그 컬럼이 있으면 값이 같아도 발동하므로, WHEN으로
-- 실제 변경만 남긴다.
CREATE TRIGGER trg_sources_digestion_input_updated_at
  BEFORE UPDATE OF body, space_id ON sources
  FOR EACH ROW
  WHEN (
    OLD.body IS DISTINCT FROM NEW.body
    OR OLD.space_id IS DISTINCT FROM NEW.space_id
  )
  EXECUTE FUNCTION update_digestion_input_updated_at();
