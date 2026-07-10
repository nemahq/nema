-- =============================================================
-- 신규 유저 랜딩 슬라이스: "첫 진입" 신호 (workspace-account-flow)
--
-- 가입 트리거(handle_new_user)가 가입 순간 Workspace·Space를 이미 만들어두므로
-- "Space가 0개면 지금 만든다"는 판정으로는 신규/기존을 못 가른다 — bootstrap
-- 호출 시점엔 Space가 항상 이미 있다. 그래서 "Space 존재"가 아니라 "이 유저가
-- 지금 처음 로그인했다" 자체를 profiles에 직접 표시한다.
-- =============================================================

ALTER TABLE profiles ADD COLUMN first_entered_at timestamptz;

-- profiles 행이 아직 없으면(설정을 한 번도 안 건드린 신규 유저) 만들면서 동시에
-- 첫 진입을 표시한다. UPDATE ... WHERE first_entered_at IS NULL은 행 잠금으로
-- 직렬화되어, 탭 두 개가 동시에 처음 들어와도 정확히 한 호출만 true를 받는다
-- (profiles_owner RLS가 이미 본인 행 전체 CRUD를 허용해 SECURITY DEFINER 불필요).
CREATE OR REPLACE FUNCTION mark_first_entry()
RETURNS boolean AS $$
DECLARE
  v_is_first_entry boolean;
BEGIN
  INSERT INTO profiles (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE profiles
  SET first_entered_at = now()
  WHERE user_id = auth.uid() AND first_entered_at IS NULL;

  v_is_first_entry := FOUND;

  RETURN v_is_first_entry;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION mark_first_entry FROM public, anon;
GRANT EXECUTE ON FUNCTION mark_first_entry TO authenticated;
