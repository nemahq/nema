-- =============================================================
-- Source·Digest URL용 public_id 도입 (legacy Digest public_id,
-- legacy/supabase/migrations/20260721110002_digest_public_id.sql과 같은 패턴)
--
-- 주소(?source=…/?digest=…)가 내부 uuid(id) 대신 opaque 짧은 공개 ID를 실을 수
-- 있게 한다. 우리는 legacy의 RPC(confirm_ingestion_review 등) 대신 JS에서 직접
-- insert하지만 결론은 같다 — Digest는 물론 Source도 JS가 개별 생성 시점에
-- public_id를 채울 필요가 없다. 컬럼 DEFAULT 하나로 충분하다(62^12 키스페이스라
-- 실질 충돌 확률은 0에 가깝다). Space처럼 "JS가 nanoid 생성 + 트리거 재시도"로
-- 나눌 이유가 없다.
-- =============================================================

CREATE FUNCTION generate_source_public_id()
RETURNS text AS $$
DECLARE
  -- 형식은 SourceSchema(packages/shared/src/schemas/source.ts)의 SOURCE_PUBLIC_ID_*
  -- 상수와 맞춰져 있다 — 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
  v_alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_length   int := 12; -- SOURCE_PUBLIC_ID_LENGTH와 맞춘 값
  v_id       text := '';
  i          int;
BEGIN
  FOR i IN 1..v_length LOOP
    v_id := v_id || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  END LOOP;
  RETURN 'src_' || v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE FUNCTION generate_digest_public_id()
RETURNS text AS $$
DECLARE
  -- 형식은 DigestSchema(packages/shared/src/schemas/digest.ts)의 DIGEST_PUBLIC_ID_*
  -- 상수와 맞춰져 있다 — 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
  v_alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_length   int := 12; -- DIGEST_PUBLIC_ID_LENGTH와 맞춘 값
  v_id       text := '';
  i          int;
BEGIN
  FOR i IN 1..v_length LOOP
    v_id := v_id || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  END LOOP;
  RETURN 'dgt_' || v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

ALTER TABLE sources ADD COLUMN public_id text;
ALTER TABLE digests ADD COLUMN public_id text;

UPDATE sources SET public_id = generate_source_public_id() WHERE public_id IS NULL;
UPDATE digests SET public_id = generate_digest_public_id() WHERE public_id IS NULL;

ALTER TABLE sources ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE digests ALTER COLUMN public_id SET NOT NULL;

ALTER TABLE sources ALTER COLUMN public_id SET DEFAULT generate_source_public_id();
ALTER TABLE digests ALTER COLUMN public_id SET DEFAULT generate_digest_public_id();

ALTER TABLE sources ADD CONSTRAINT sources_public_id_key UNIQUE (public_id);
ALTER TABLE digests ADD CONSTRAINT digests_public_id_key UNIQUE (public_id);
