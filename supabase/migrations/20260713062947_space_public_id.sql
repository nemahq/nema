-- =============================================================
-- Space URL용 public_id 도입
--
-- /space/$spaceId URL에 실제 UUID(id)가 그대로 노출되던 걸, 내부 id와 분리된
-- opaque 짧은 공개 ID로 대체한다(Stripe cus_NffrFeUfNV2Hib류 패턴). 이름 기반
-- 슬러그는 안 쓴다 — Space는 이름을 자주 바꾸는 엔티티라 슬러그 재생성·중복
-- 처리·낡은 이름 노출 문제만 생기고, 지금은 SEO·공개 공유 요구도 없다.
--
-- 생성 경로가 둘로 갈린다:
--   - create_space RPC(사용자가 직접 만드는 Space): 서버(space-service.ts)가
--     nanoid로 만들어 파라미터로 넘긴다 — Postgres 쪽에 ID 생성 로직을 새로
--     안 두려는 의도.
--   - handle_new_user 트리거(가입 시 자동 생성되는 기본 Space): 앱 레이어를
--     거칠 방법이 없어 DB 헬퍼 generate_space_public_id()로 자체 생성한다.
--     같은 이유로 기존 행 백필에도 이 헬퍼를 재사용한다.
-- 62^12 키스페이스라 두 경로 모두 충돌 재시도 없이 충돌 시 unique_violation을
-- 그대로 드러낸다 — create_space처럼 "이름 중복"으로 오보하면 안 되는 케이스라
-- 아래 EXCEPTION 블록에서도 spaces_public_id_key는 걸러내지 않고 그대로 RAISE.
-- =============================================================

CREATE FUNCTION generate_space_public_id()
RETURNS text AS $$
DECLARE
  v_alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_id       text := '';
  i          int;
BEGIN
  FOR i IN 1..12 LOOP
    v_id := v_id || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  END LOOP;
  RETURN 'spc_' || v_id;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE spaces ADD COLUMN public_id text;

-- 기존 행 백필 — 배치 백필이라 단건 생성보다 충돌 확률이 실질적으로 높으므로
-- (드물지만) 충돌을 감지해 재시도한다.
DO $$
DECLARE
  v_space     record;
  v_candidate text;
BEGIN
  FOR v_space IN SELECT id FROM spaces WHERE public_id IS NULL LOOP
    LOOP
      v_candidate := generate_space_public_id();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM spaces WHERE public_id = v_candidate);
    END LOOP;
    UPDATE spaces SET public_id = v_candidate WHERE id = v_space.id;
  END LOOP;
END $$;

ALTER TABLE spaces ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE spaces ADD CONSTRAINT spaces_public_id_key UNIQUE (public_id);

-- =============================================================
-- create_space — p_public_id 파라미터 추가 (서버가 nanoid로 생성해 전달)
-- =============================================================

DROP FUNCTION create_space(uuid, text);

CREATE FUNCTION create_space(p_workspace_id uuid, p_name text, p_public_id text)
RETURNS uuid AS $$
DECLARE
  v_space_id   uuid;
  v_constraint text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % is not accessible to the caller', p_workspace_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO spaces (workspace_id, name, public_id)
  VALUES (p_workspace_id, btrim(p_name), p_public_id)
  RETURNING id INTO v_space_id;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, auth.uid(), 'owner');
  END IF;

  RETURN v_space_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'spaces_workspace_id_name_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a space named "%" already exists in this workspace', btrim(p_name)
    USING ERRCODE = 'NM003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_space(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_space(uuid, text, text) TO authenticated, service_role;

-- =============================================================
-- handle_new_user — 가입 시 자동 생성되는 기본 Space도 public_id 채워서 만든다
-- =============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_workspace_id uuid;
  v_space_id     uuid;
BEGIN
  INSERT INTO workspaces (name) VALUES (NULL) RETURNING id INTO v_workspace_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_workspace_id, NEW.id, 'owner');
  INSERT INTO spaces (name, workspace_id, public_id)
  VALUES ('My Space', v_workspace_id, generate_space_public_id())
  RETURNING id INTO v_space_id;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
