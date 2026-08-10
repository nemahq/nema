-- =============================================================
-- save-engine-v2 2/6: 소유 층 — spaces, space_members
-- 소유는 user 직접이 아니라 Space 한 겹 건너. 모든 기록은 space_id로 소유를 묶는다.
-- 주인은 owner_id 컬럼이 아니라 space_members.role='owner'로 표현 —
-- "개인=팀, 멤버 수만 다른 같은 단위" 정의를 지키려고 조인으로 둔다.
-- =============================================================

CREATE TYPE space_role AS ENUM ('owner', 'member');

-- ----- 소유 칸 -----
CREATE TABLE spaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,  -- 채우는 정책은 구현 단계. 자리만 nullable
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----- 사람 ↔ 칸 명단 (조인). 멀티플레이어 전환 = 여기에 row 추가 -----
CREATE TABLE space_members (
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        space_role NOT NULL,  -- 1인 단계에선 무동작, 자리만
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

-- =============================================================
-- Indexes
-- =============================================================

-- 사용자→Space 역조회용 (is_space_member의 등치 조회는 PK(space_id, user_id)가 커버)
CREATE INDEX idx_space_members_user ON space_members (user_id);

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_spaces_updated_at
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_space_members_updated_at
  BEFORE UPDATE ON space_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 소유 판정 헬퍼 — 협업 단계에서 접근 규칙(공유·그룹)이 붙어도
-- 이 함수 한 곳만 고치면 전 테이블 RLS에 반영된다.
-- =============================================================

CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = p_space_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE spaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spaces_member_select" ON spaces
  FOR SELECT USING (is_space_member(id));

CREATE POLICY "space_members_member_select" ON space_members
  FOR SELECT USING (is_space_member(space_id));

-- =============================================================
-- 가입 트리거 — 사람당 개인 Space 1개 자동 생성 (Member 1명)
-- 소유의 뿌리(Space 존재)를 앱 누락 위험에서 떼어내 DB 불변식으로 박는다.
-- 가입 경로가 분화(개인/초대/회사 도메인)되면 앱 레이어로 이전 — 되돌리기 싼 결정.
-- =============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE v_space_id uuid;
BEGIN
  INSERT INTO spaces (name) VALUES (NULL) RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----- 기존 가입 사용자 백필 -----
-- 트리거는 새 가입에만 발동한다. 이미 가입된 계정에도 같은 부트스트랩을 적용해
-- "모든 사용자는 Space를 가진다" 불변식을 기존 계정까지 성립시킨다.
DO $$
DECLARE
  v_user_id  uuid;
  v_space_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT u.id FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM space_members m WHERE m.user_id = u.id)
  LOOP
    INSERT INTO spaces (name) VALUES (NULL) RETURNING id INTO v_space_id;
    INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, v_user_id, 'owner');
  END LOOP;
END $$;
