-- =============================================================
-- profiles 슬라이스: profiles 신설
--
-- auth.users와 1:1인 프로필 확장 필드. 이번 스코프는 content_language(콘텐츠 언어
-- 설정) 하나뿐 — legacy(20260320000000_multilingual_translation.sql)에서 그대로
-- 옮긴다. 정리 프롬프트가 이 값을 읽어 다이제스트 언어를 정한다(digest-generation.ts
-- 참고. "원문과 같은 언어로 쓴다"는 지시는 신뢰도가 낮아 빠졌다) — 행이 없으면(온보딩
-- 전) 이 컬럼의 기본값과 같은 "en"으로 떨어진다.
-- =============================================================

CREATE TYPE content_language AS ENUM ('en', 'ko');

CREATE TABLE profiles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content_language  content_language NOT NULL DEFAULT 'en',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- RLS — owner-only. get/update(upsert) 경로만 있어 select·insert·update만 둔다
-- (프로필 행 삭제는 앱에서 하지 않는다 — 계정 삭제 시 auth.users CASCADE로 없어진다).
-- =============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner_select" ON profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "profiles_owner_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "profiles_owner_update" ON profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
