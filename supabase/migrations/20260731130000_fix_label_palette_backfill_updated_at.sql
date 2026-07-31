-- =============================================================
-- 20260731110000(Reference 독립 존재 + 리뷰 라벨 팔레트, 이미 staging에 배포됨)의
-- label_draft 백필이 트리거를 끄지 않고 모든 ingestion/revert changeset을 UPDATE해서,
-- trg_changesets_updated_at(컬럼 무관 모든 UPDATE에 반응하는 범용 트리거)가 판정
-- 시각(closedByName과 함께 화면에 노출되는 updated_at)을 그 배포 시각으로 일괄
-- 리셋했다. 20260718100000_fix_changeset_title_backfill_updated_at.sql과 같은
-- 사정·같은 패턴 — 이 마이그레이션이 그 잔여 오염을 보정한다.
--
-- 원래 값("판단이 내려진 시각")은 복원 불가 — created_at으로 근사 복원한다. 특정
-- 시각을 하드코딩하지 않고, "type이 ingestion/revert인데 updated_at이 여러 행에서
-- 완전히 같은" 패턴으로 오염된 행을 스스로 찾는다 — 서로 독립적으로 판정된
-- changeset들이 마이크로초 단위까지 우연히 같은 시각에 갱신될 확률은 사실상 0이므로,
-- 이 패턴 자체가 "한 UPDATE 문에 일괄로 찍힌 시각"이라는 증거다. 이 방식이면 이미
-- 트리거가 고쳐진 버전만 적용된 환경(로컬 fresh reset 등, 애초에 오염이 없는 경우)
-- 에서 실행돼도 안전하게 no-op이다.
-- =============================================================

ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

WITH polluted_timestamps AS (
  SELECT updated_at
  FROM changesets
  WHERE type IN ('ingestion', 'revert')
  GROUP BY updated_at
  HAVING count(*) > 1
)
UPDATE changesets c
SET updated_at = c.created_at
WHERE c.type IN ('ingestion', 'revert')
  AND c.updated_at IN (SELECT updated_at FROM polluted_timestamps);

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;
