-- =============================================================
-- Digest URL용 public_id 도입 (Space public_id, 20260713062947와 같은 패턴)
--
-- 스레드 피드·Digest 상세가 내부 uuid(id) 대신 opaque 짧은 공개 ID로 링크·공유될
-- 수 있게 한다. Space와 달리 Digest는 전부 SQL RPC(confirm_ingestion_review,
-- confirm_digest_edit) 안에서만 생성되고 JS 레이어가 개별 생성에 관여하지 않으므로,
-- Space처럼 "JS가 nanoid 생성 + 트리거만 재시도"로 나눌 이유가 없다 — 컬럼 DEFAULT
-- 하나로 충분하다. 62^12 키스페이스라 실질 충돌 확률은 0에 가깝고(Space 마이그레이션과
-- 같은 근거), Space의 백필처럼 재시도 루프도 필요 없다(단건 UPDATE만 있으면 됨).
-- =============================================================

CREATE FUNCTION generate_digest_public_id()
RETURNS text AS $$
DECLARE
  -- 형식은 DigestSchema(packages/shared/src/schemas/digest.ts)의 DIGEST_PUBLIC_ID_*
  -- 상수와 맞춰져 있다 — 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
  v_alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_id       text := '';
  i          int;
BEGIN
  FOR i IN 1..12 LOOP
    v_id := v_id || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  END LOOP;
  RETURN 'dgt_' || v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

ALTER TABLE digests ADD COLUMN public_id text;

UPDATE digests SET public_id = generate_digest_public_id() WHERE public_id IS NULL;

ALTER TABLE digests ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE digests ALTER COLUMN public_id SET DEFAULT generate_digest_public_id();
ALTER TABLE digests ADD CONSTRAINT digests_public_id_key UNIQUE (public_id);
