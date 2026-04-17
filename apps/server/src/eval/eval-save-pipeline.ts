// 저장 파이프라인(SPLIT → JUDGMENT → META → DB 기록) 수동 E2E 검증용.
// 실제 Supabase/Qdrant/LLM에 write 발생하므로 staging 환경에서 TEST_USER_ID로 제한 실행.
//
// 실행:
//   TEST_USER_ID=<uuid> DRAFT="..." [CONTENT_LANG=ko|en] [LLM_PRESET=real-tiers|all-nano] \
//   pnpm exec tsx src/eval/eval-save-pipeline.ts
//
// - CONTENT_LANG 기본값: ko
// - LLM_PRESET 기본값: real-tiers (nano 프리셋은 판단 품질이 낮아 수동 검증엔 부적합)
// - 임시 세션을 만들어 실행 후 삭제한다. 생성된 memory/history/revision은 검증을 위해 남긴다.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import { getProviders, setLlmPreset } from "@server/infra/providers";
import { getSupabaseAdmin } from "@server/infra/supabase";
import { handleSave } from "@server/services/chat/saving";

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  loadEnv(resolve(scriptDir, "../.."));

  const testUserId = process.env.TEST_USER_ID;
  const draftBody = process.env.DRAFT;
  if (!testUserId || !draftBody) {
    throw new Error("TEST_USER_ID and DRAFT env vars are required");
  }

  const supabase = getSupabaseAdmin();
  getProviders();
  const preset = (process.env.LLM_PRESET ?? "real-tiers") as
    | "real-tiers"
    | "all-nano";
  setLlmPreset(preset);
  const providers = getProviders();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ user_id: testUserId, messages: [] })
    .select("id")
    .single();
  if (sessionError) {
    throw sessionError;
  }

  console.log(`\n[eval] preset=${preset} draft="${draftBody}"`);

  const start = Date.now();
  const result = await handleSave({
    supabase,
    providers,
    userId: testUserId,
    sessionId: session.id,
    draftBody,
    contentLanguage: (process.env.CONTENT_LANG ?? "ko") as "ko" | "en",
  });
  const elapsed = Date.now() - start;

  console.log(
    `[eval] completed in ${elapsed}ms, historyId=${result.historyId}`,
  );

  const { data: revisions } = await supabase
    .from("memory_revisions")
    .select("memory_id, update_type, prev_body, next_body")
    .eq("history_id", result.historyId);

  console.log(`[eval] revisions (${revisions?.length ?? 0}):`);
  revisions?.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.update_type}] memory_id=${r.memory_id}`);
    if (r.prev_body) {
      console.log(`     PREV: ${r.prev_body}`);
    }
    console.log(`     NEXT: ${r.next_body}`);
  });

  await supabase.from("sessions").delete().eq("id", session.id);
  process.exit(0);
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
