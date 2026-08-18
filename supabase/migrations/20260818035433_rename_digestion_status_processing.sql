-- =============================================================
-- digestion_status를 processing/completed/failed 세 값으로 확장
-- (kickoff: fix/draft-error-state)
--
-- 지금까지 pending 하나가 "처리 중"·"진짜 실패"·"상태 갱신만 실패한 유령" 세
-- 상황을 다 떠안고 있었다. 화면은 그중 하나(pending)를 무조건 실패로 그렸는데,
-- 실제로는 처리 중인 정상 구간이 대부분이라 성공한 원문이 초안 탭에 에러로
-- 보이는 문제로 이어졌다. 상태 자체를 셋으로 나눠 이 구분을 데이터가 갖게 한다.
--
-- pending → processing 개명은 prod에 실사용 데이터가 있는 상태에서 적용된다.
-- RENAME VALUE는 pg_enum 카탈로그의 라벨만 바꾸고 내부 저장값(oid)은 그대로다 —
-- 기존 행은 데이터 이관 없이 새 라벨을 그대로 받는다(digestion_status='pending'인
-- 행은 이 마이그레이션 이후 자동으로 'processing'으로 보인다).
--
-- ADD VALUE로 새로 추가한 'failed'는 이 트랜잭션 안에서 바로 못 쓴다(Postgres
-- 제약 — 같은 트랜잭션에서 추가한 enum 값은 그 트랜잭션이 끝나야 참조할 수
-- 있다). 이 값을 쓰는 뷰 갱신은 다음 마이그레이션으로 분리한다.
-- =============================================================

ALTER TYPE digestion_status RENAME VALUE 'pending' TO 'processing';
ALTER TYPE digestion_status ADD VALUE 'failed';

ALTER TABLE sources ALTER COLUMN digestion_status SET DEFAULT 'processing';

COMMENT ON COLUMN sources.digestion_status IS
  'processing(처리 중 — 초안 탭에 안 보임) / completed(정상 종료) /
   failed(파이프라인 도중 실패 — 초안 탭에 노출). 기본값 processing.';
