-- =============================================================
-- save-engine-v2 4/6: 변경 층 — changesets, changes
-- 한 번의 변경 묶음(changesets, histories 대체)과 개별 연산(changes).
-- append-only 되돌리기: applied를 되돌릴 때 status를 바꾸지 않고 revert 변경셋을 추가한다.
-- 첫 출시에 실제로 생성되는 type은 ingestion·manual·revert 3개 —
-- conflict·merge는 관계 엔진이 만들어 미연결(스키마는 받아둠).
-- =============================================================

CREATE TYPE changeset_type     AS ENUM ('ingestion', 'conflict', 'merge', 'manual', 'revert');
CREATE TYPE changeset_status   AS ENUM ('pending', 'applied');
CREATE TYPE change_action      AS ENUM ('create', 'archive', 'modify');
CREATE TYPE change_target_type AS ENUM ('statement', 'relation', 'source');

-- ----- 변경셋: 한 번의 변경 묶음 -----
CREATE TABLE changesets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type        changeset_type NOT NULL,
  status      changeset_status NOT NULL,  -- DEFAULT 없음 — 생성 RPC가 명시적으로 정함
  source_id   uuid REFERENCES sources(id)    ON DELETE CASCADE,   -- ingestion이면 어느 원본 (같은 Space라 동반 삭제)
  reverts_id  uuid REFERENCES changesets(id) ON DELETE CASCADE,   -- revert면 되돌리는 대상
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 변경을 일으킨 주체(사람). 엔진이면 NULL. 계정 삭제 시 NULL로 보존
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- type별 무결성. author_id는 "엔진 type은 반드시 NULL"만 DB로 강제하고,
  -- 사람 type의 author 필수는 생성 RPC가 보장한다 (계정 삭제 시 SET NULL과 양립시키기 위함).
  CONSTRAINT chk_changeset_shape CHECK (
    (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
    (type = 'revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
    (type = 'manual'    AND source_id IS NULL AND reverts_id IS NULL) OR
    (type IN ('conflict', 'merge') AND source_id IS NULL AND reverts_id IS NULL AND author_id IS NULL)
  )
);

-- ----- 개별 연산 -----
-- target_id는 FK 없는 polymorphic — 대상이 3종이라 단일 FK 불가 +
-- 이력 로그라 Space 삭제로 대상이 사라져도 "무엇을 했는지"가 남아야 한다.
-- 생성 시 대상 존재 보장은 RPC가 한다.
CREATE TABLE changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changeset_id  uuid NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
  action        change_action NOT NULL,
  target_type   change_target_type NOT NULL,
  target_id     uuid NOT NULL,
  data          jsonb,  -- create/modify에서. archive엔 없음. 형식(modify before/after)은 구현 단계로 열어둠
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_data_by_action CHECK (
    (action IN ('create', 'modify') AND data IS NOT NULL)
    OR (action = 'archive' AND data IS NULL)
  ),
  -- 원본은 불변 — "수정"은 폐기(archive)+재생성으로 표현.
  -- 진술 modify는 막지 않는다(모델이 허용, 첫 출시엔 미사용).
  CONSTRAINT chk_no_source_modify CHECK (
    NOT (target_type = 'source' AND action = 'modify')
  )
);

-- =============================================================
-- Indexes
-- =============================================================

CREATE INDEX idx_changesets_space_created ON changesets (space_id, created_at DESC);
CREATE INDEX idx_changes_changeset        ON changes (changeset_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_changesets_updated_at
  BEFORE UPDATE ON changesets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE changesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changesets_member_select" ON changesets
  FOR SELECT USING (is_space_member(space_id));

CREATE POLICY "changes_member_select" ON changes
  FOR SELECT USING (
    changeset_id IN (SELECT id FROM changesets WHERE is_space_member(space_id))
  );
