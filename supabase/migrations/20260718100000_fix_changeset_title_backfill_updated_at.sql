-- =============================================================
-- changesets.updated_at 백필 오염 보정
--
--   20260718090000_changeset_title.sql의 6번 섹션(기존 changeset 백필)이
--   트리거를 끄지 않고 UPDATE changesets를 돌려, trg_changesets_updated_at
--   (컬럼 무관 모든 UPDATE에 반응하는 범용 트리거)가 그때 이미 closed였던
--   changeset 전부의 updated_at을 그 배포 시각으로 덮어썼다. 그 마이그레이션은
--   같은 세션에서 이미 트리거 disable/enable로 수정했지만, 그건 앞으로
--   재적용될 때(fresh reset)만 효과가 있고 이미 실행된 환경(staging)의 오염된
--   값은 그대로 남는다 — 이 마이그레이션이 그 잔여 오염을 보정한다.
--
--   원래 값("판단이 내려진 시각")은 복원 불가 — created_at으로 근사 복원한다.
--   특정 시각을 하드코딩하지 않고, "closed인데 updated_at이 여러 행에서
--   완전히 같은" 패턴으로 오염된 행을 스스로 찾는다 — 서로 독립적으로 판정된
--   changeset들이 마이크로초 단위까지 우연히 같은 시각에 닫힐 확률은 사실상
--   0이므로, 이 패턴 자체가 "한 UPDATE 문에 일괄로 찍힌 시각"이라는 증거다.
--   이 방식이면 이 파일이 다른 환경(로컬 fresh reset 등, 이미 트리거가 고쳐진
--   버전만 적용돼 애초에 오염이 없는 경우)에서 실행돼도 안전하게 no-op이다.
-- =============================================================

ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

WITH polluted_timestamps AS (
  SELECT updated_at
  FROM changesets
  WHERE status <> 'pending'
  GROUP BY updated_at
  HAVING count(*) > 1
)
UPDATE changesets c
SET updated_at = c.created_at
WHERE c.status <> 'pending'
  AND c.updated_at IN (SELECT updated_at FROM polluted_timestamps);

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;
