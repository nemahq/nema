import type { Digest, Statement } from "@nema-io/shared";
import { DIGEST_FIELD_BY_TYPE, StatementSchema } from "@nema-io/shared";

import type { LlmErrorCode } from "@server/infra/llm/llm-error";
import { LlmError } from "@server/infra/llm/llm-error";
import { getStatementGenerationProvider } from "@server/infra/llm/provider";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import {
  buildStatementGenerationMessage,
  buildStatementGenerationSystemPrompt,
  StatementGenerationSchema,
} from "@server/prompts/statement-generation";

// 몇 번 다시 하고, 상한까지 가면 진술 없이 남긴다(linking.md 2.2 "못 만들면") —
// 사용자에게 안 알린다. 알려도 할 수 있는 게 없고, 멀쩡한 다이제스트를 빼고
// 원문부터 다시 돌리게 하는 건 얻는 것보다 잃는 게 크다.
const MAX_GENERATION_ATTEMPTS = 3;

// 재시도 사이의 대기 — 특히 rate_limit은 같은 쿼터 창 안에서 즉시 재시도하면
// 매번 그대로 다시 걸려 재시도가 사실상 무의미해진다.
const RETRY_BACKOFF_MS = 500;

// Record — 새 LlmErrorCode가 추가되면 여기 값을 안 정한 채로는 컴파일이 안 된다
// (docs/guides/conventions.md "같은 판별자는 Record 맵 우선"). Set 멤버십 체크였다면
// 새 코드가 조용히 "재시도함"으로 새 뒤졌을 것 — DIGEST_FIELD_BY_TYPE의
// satisfies Record<DigestType, ...>와 같은 이유로 여기도 강제한다.
const RETRYABLE_LLM_ERROR_CODES = {
  timeout: true,
  rate_limit: true,
  unknown: true,
  auth: false,
  bad_request: false,
  content_filter: false,
} as const satisfies Record<LlmErrorCode, boolean>;

// 다이제스트마다 독립으로 생성·저장한다(다이제스트끼리 참조하지 않아 병렬로 돌린다,
// linking.md 2.1·2.2). 하나가 실패해도 나머지는 살아야 해서 함수 경계 밖으로 던지지
// 않는다 — 실패하면 로그 한 줄만 남기고 그 다이제스트는 statement 없이 넘어간다.
export async function generateAndSaveStatements(args: {
  supabase: TypedSupabaseClient;
  digests: Digest[];
}): Promise<Map<string, Statement>> {
  const { supabase, digests } = args;
  const results = await Promise.all(
    digests.map((digest) => generateAndSaveStatement({ supabase, digest })),
  );

  const entries = digests
    .map((digest, i) => [digest.id, results[i]] as const)
    .filter((entry): entry is [string, Statement] => entry[1] !== null);
  return new Map(entries);
}

async function generateAndSaveStatement(args: {
  supabase: TypedSupabaseClient;
  digest: Digest;
}): Promise<Statement | null> {
  const { supabase, digest } = args;
  // 로그에 실패 단계를 남긴다 — LLM 생성 실패(의도된 침묵)와 insert/검증 실패
  // (RLS 정책 버그 등, 원래 안 나야 할 실패)를 같은 로그 한 줄로 뭉개면 후자가
  // 관측 인프라 없이 무기한 숨을 수 있다.
  let stage: "generation" | "insert" | "validation" = "generation";
  try {
    const content = await generateStatementSentence(digest);

    stage = "insert";
    const { data, error } = await supabase
      .from("statements")
      .insert({
        digest_id: digest.id,
        digest_field: DIGEST_FIELD_BY_TYPE[digest.type],
        content,
      })
      .select("id, digest_id, digest_field, content, created_at")
      .single();
    throwIfSupabaseError(error);

    stage = "validation";
    return toStatement(data);
  } catch (error) {
    console.warn(
      `[statement-generation:${stage}] digest ${digest.id} (${digest.type}) — no statement saved:`,
      error,
    );
    return null;
  }
}

async function generateStatementSentence(digest: Digest): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      const result = await getStatementGenerationProvider().generateStructured({
        systemPrompt: buildStatementGenerationSystemPrompt(),
        messages: [
          { role: "user", content: buildStatementGenerationMessage(digest) },
        ],
        schema: StatementGenerationSchema,
      });
      return result.statement;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_GENERATION_ATTEMPTS) {
        break;
      }
      await delay(RETRY_BACKOFF_MS);
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof LlmError) {
    return RETRYABLE_LLM_ERROR_CODES[error.code];
  }
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StatementRow = Pick<
  Database["public"]["Tables"]["statements"]["Row"],
  "id" | "digest_id" | "digest_field" | "content" | "created_at"
>;

// DB round-trip 결과를 단언하지 않고 실제로 검증한다 — source-service.ts의 toDigest와
// 같은 근거(DB→API 응답 경계의 방어선).
function toStatement(row: StatementRow): Statement {
  return StatementSchema.parse({
    id: row.id,
    digestId: row.digest_id,
    digestField: row.digest_field,
    content: row.content,
    createdAt: row.created_at,
  });
}
