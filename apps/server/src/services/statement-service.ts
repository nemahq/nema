import type { Digest, Statement } from "@nema-io/shared";
import { DIGEST_FIELD_BY_TYPE, StatementSchema } from "@nema-io/shared";

import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";

// 다이제스트의 주된 칸 값을 그대로 진술 content로 쓴다 — LLM로 다시 쓰지 않는다.
// human-review 11케이스로 보니 LLM이 한 일이 주된 칸에 종결어미를 붙인 것과
// 다르지 않았고, 그 값 하나를 얻으려 다이제스트마다 LLM 콜을 더 쓰는 건 안
// 맞았다(PM 지침) — 원문당 호출이 1(다이제스트 생성)+N(진술 생성)에서 1로 준다.
//
// 진술 개념 자체는 안 바뀐다. 존재 이유는 "LLM이 다시 쓴 문장"이 아니라
// 다이제스트에서 관계를 걸 자리를 주된 칸 하나로 좁히는 것이다(linking.md 2.2,
// "주장하지 않는 칸은 부딪힐 수도 겹칠 수도 없다").
//
// 주된 칸이 다이제스트 생성 스키마에서 required라 값은 항상 있다고 놓고 짠다
// (digest-generation.ts와 같은 전제, 빈 칸 방어 코드를 두지 않는다). 그래서 남는
// 실패는 저장(insert)뿐이고, 그건 원래 나면 안 되는 실패다(RLS 정책 버그 등).
// "진술 없는 다이제스트 비율"도 이제 품질 신호가 아니라 버그 신호다 — 0이 아니면
// 무조건 봐야 하는 값이다.
export async function saveStatements(args: {
  supabase: TypedSupabaseClient;
  digests: Digest[];
}): Promise<Map<string, Statement>> {
  const { supabase, digests } = args;
  if (digests.length === 0) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from("statements")
      .insert(
        digests.map((digest) => ({
          digest_id: digest.id,
          digest_field: DIGEST_FIELD_BY_TYPE[digest.type],
          content: primaryFieldValue(digest),
        })),
      )
      .select("id, digest_id, digest_field, content, created_at");
    throwIfSupabaseError(error);

    return new Map(
      (data ?? []).map((row) => [row.digest_id, toStatement(row)]),
    );
  } catch (error) {
    console.warn(
      `[statement] 다이제스트 ${digests.length}개 저장 실패 — 원문은 살고 진술은 없이 남는다:`,
      error,
    );
    return new Map();
  }
}

// 주된 칸 다섯이 유형마다 이름이 달라(DIGEST_FIELD_BY_TYPE), digest.type으로 좁혀야
// body에서 그 칸을 타입 안전하게 꺼낼 수 있다.
function primaryFieldValue(digest: Digest): string {
  switch (digest.type) {
    case "decision":
      return assertPrimaryField(digest, digest.body.choice);
    case "pending":
      return assertPrimaryField(digest, digest.body.question);
    case "learning":
      return assertPrimaryField(digest, digest.body.finding);
    case "idea":
      return assertPrimaryField(digest, digest.body.concept);
    case "assumption":
      return assertPrimaryField(digest, digest.body.assumption);
  }
}

// required 전제(주된 칸은 항상 채워져 있다, digest-generation.ts와 같은 전제)가
// 깨지면 조용히 넘기지 않고 던진다 — 다이제스트 생성 쪽 버그가 빈 진술로 새지 않게.
function assertPrimaryField(digest: Digest, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(
      `digest ${digest.id} (${digest.type})의 주된 칸(${DIGEST_FIELD_BY_TYPE[digest.type]})이 비어 있다`,
    );
  }
  return value;
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
