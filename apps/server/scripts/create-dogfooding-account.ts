// 지금 로그인 경로가 Google OAuth와 매직링크뿐이라 Claude 세션 같은 자동화 호출자는
// 토큰을 못 받는다. Supabase는 대시보드 버튼만 없을 뿐 아이디·비밀번호(password grant)를
// 항상 지원하므로, admin API로 계정을 하나 만들어두면 그 경로로 토큰을 받고 refresh로
// 갱신할 수 있다(docs/blueprints/first-product/engine/organizing.md 킥오프 "도그푸딩 계정").
//
// 사용법 — staging:
//   DOGFOODING_EMAIL=claude@getnema.app DOGFOODING_PASSWORD='...' APP_ENV=staging \
//     npx tsx apps/server/scripts/create-dogfooding-account.ts
// 로컬 Supabase 대상이면 APP_ENV=local로 바꾼다.
//
// 토큰 발급·갱신은 Supabase Auth REST API를 직접 호출한다(SDK 불필요, SUPABASE_URL·
// SUPABASE_ANON_KEY는 apps/server/.env.{mode}):
//   curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
//     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
//     -d '{"email":"'"$DOGFOODING_EMAIL"'","password":"'"$DOGFOODING_PASSWORD"'"}'
//   curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=refresh_token" \
//     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
//     -d '{"refresh_token":"..."}'

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "../src/env";
import { getSupabaseAdmin } from "../src/infra/supabase";

async function main() {
  const email = process.env["DOGFOODING_EMAIL"];
  const password = process.env["DOGFOODING_PASSWORD"];
  if (!email || !password) {
    throw new Error(
      "DOGFOODING_EMAIL and DOGFOODING_PASSWORD environment variables are required.",
    );
  }

  loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw error;
  }

  // eslint-disable-next-line no-console -- 운영 스크립트 출력, src/ 밖이라 앱 규칙과 무관
  console.log(`도그푸딩 계정 생성 완료: ${email} (user id: ${data.user?.id})`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- 운영 스크립트 출력, src/ 밖이라 앱 규칙과 무관
  console.error(err);
  process.exit(1);
});
