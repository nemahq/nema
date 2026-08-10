-- digestion_input_updated_at 트리거에서 space_id를 뺀다. 도입 당시(20260720150000)
-- 근거는 "Space를 옮기면 LLM이 보는 Topic 레지스트리가 달라진다"였는데, 이건 결함이
-- 아니라 Topic이 Space 스코프로 설계된 그대로다(각 Space 기준으론 항상 맞는 결과라
-- "재시도하면 더 나아진다"는 전제가 성립하지 않는다). 이 컬럼의 유일한 소비처인
-- "결과없음 재정리 게이트"(원문을 안 고치고 다시 정리해봐야 같은 결과) 관점에서도
-- Space 이동은 추출 여부 자체엔 영향이 없다(digest-generation.ts의 existing_topics는
-- 라벨링에만 쓰이지 추출 판정엔 안 쓰인다). body만 남긴다.

DROP TRIGGER IF EXISTS trg_sources_digestion_input_updated_at ON sources;

CREATE TRIGGER trg_sources_digestion_input_updated_at
  BEFORE UPDATE OF body ON sources
  FOR EACH ROW
  WHEN (OLD.body IS DISTINCT FROM NEW.body)
  EXECUTE FUNCTION update_digestion_input_updated_at();
