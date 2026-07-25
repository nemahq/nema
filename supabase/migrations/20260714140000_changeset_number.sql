-- =============================================================
-- Changeset.number — Space 안에서 순차 증가하는, 사람이 지칭하기 위한 번호
-- (07-modeling.md "GitHub의 PR·이슈 번호와 같은 역할", Changeset 상세·Digest 리뷰
-- 화면 헤더의 "#12" 표시가 이걸 쓴다. title(엔진 자동 생성)은 이번 슬라이스 밖 —
-- review-flow.md의 별도 백로그 "Changeset 제목 자동 생성"으로 남겨둔다.)
--
-- 부여 방식: changesets INSERT 트리거가 spaces.next_changeset_number를 원자적으로
-- 증가시켜 번호를 채운다 — INSERT INTO changesets 구문이 여러 마이그레이션에 걸쳐
-- 흩어져 있어(ingestion·relation·manual·revert 전 타입) 그 전부를 고치는 대신,
-- 트리거 하나로 앞으로의 모든 생성 경로에 투명하게 적용한다("manual도 이 시퀀스를
-- 그대로 공유한다"는 07-modeling 규칙과도 맞음 — 어떤 INSERT든 예외 없음).
--
-- space_id가 NULL인 manual(Reference 직접 수정, Workspace 스코프)은 07-modeling에
-- "변경셋 목록엔 안 뜬다"고 이미 정해져 있어 번호가 화면에 노출될 일이 없다 — 그 행은
-- number도 NULL로 둔다(공유 시퀀스는 Space 스코프 개념이라 Space 밖 행에 억지로
-- 끼워 넣을 대상 시퀀스가 없다).
-- =============================================================

ALTER TABLE spaces ADD COLUMN next_changeset_number int NOT NULL DEFAULT 1;

ALTER TABLE changesets ADD COLUMN number int;

-- space_id 유무와 number 유무를 짝지어 강제 — 트리거가 항상 이 불변식을 지킨다.
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_number_iff_spaced CHECK (
  (space_id IS NULL) = (number IS NULL)
);

-- NULL은 유니크 제약에서 서로 충돌하지 않으므로(space_id NULL 행들의 number NULL도
-- 서로 무관하게 허용) 별도 부분 인덱스 없이 이 제약 하나로 충분하다.
ALTER TABLE changesets ADD CONSTRAINT uq_changeset_number_per_space UNIQUE (space_id, number);

-- =============================================================
-- 기존 행 백필 — Space별 created_at 순으로 1부터 매기고, 카운터를 그다음 값으로 맞춘다.
-- =============================================================

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY space_id ORDER BY created_at, id) AS rn
  FROM changesets
  WHERE space_id IS NOT NULL
)
UPDATE changesets c SET number = numbered.rn
FROM numbered
WHERE c.id = numbered.id;

UPDATE spaces s SET next_changeset_number = coalesce(
  (SELECT max(c.number) FROM changesets c WHERE c.space_id = s.id), 0
) + 1;

-- =============================================================
-- 트리거 — space_id가 있는 모든 INSERT에 번호를 원자적으로 채운다.
-- UPDATE ... RETURNING이 같은 space_id로의 동시 INSERT를 행 잠금으로 직렬화한다
-- (space당 한 시점에 한 트랜잭션만 다음 번호를 가져감 — MAX+1 스캔의 경합 문제 없음).
-- =============================================================

CREATE FUNCTION assign_changeset_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.space_id IS NOT NULL THEN
    UPDATE spaces SET next_changeset_number = next_changeset_number + 1
    WHERE id = NEW.space_id
    RETURNING next_changeset_number - 1 INTO NEW.number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_changesets_assign_number
  BEFORE INSERT ON changesets
  FOR EACH ROW EXECUTE FUNCTION assign_changeset_number();
