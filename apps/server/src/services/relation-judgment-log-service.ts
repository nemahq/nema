import { getSupabaseAdmin } from "@server/infra/supabase/supabase";

// 판정에 넘긴 후보와 그때 점수·판정 결과를 남긴다. 후보 상한과 유사도 문턱을 지금은
// 근거 없이 정해뒀는데(digest-relation-service 상단 참고), 떨어진 후보는 어디에도 안
// 남아서 이 기록이 없으면 나중에 값을 정할 재료가 통째로 없다.
//
// mcp-tool-call-log-service와 같은 결이다 — 사용자가 기다리는 결과가 아니라 서버가
// 스스로 남기는 텔레메트리라 admin 클라이언트로 쓰고(relation_judgments엔
// authenticated INSERT 정책이 없다), 저장이 실패해도 끝까지 삼킨다.
// interface가 아니라 type이다 — interface에는 암시적 인덱스 시그니처가 안 붙어
// jsonb 컬럼(Json)에 그대로 못 넣는다.
export type JudgedCandidate = {
  digestId: string;
  score: number;
  verdict: string;
};

export async function logRelationJudgment(args: {
  userId: string;
  digestId: string;
  /** 어느 갈래의 판정인가 — RelationJudgment.name. 갈래마다 후보 범위가 달라 점수 분포도 다르다. */
  judgment: string;
  candidates: JudgedCandidate[];
}): Promise<void> {
  const { userId, digestId, judgment, candidates } = args;
  try {
    const { error } = await getSupabaseAdmin()
      .from("relation_judgments")
      .insert({ user_id: userId, digest_id: digestId, judgment, candidates });
    if (error) {
      console.warn(
        `[relation-judgment-log] 로그 저장 실패 — digestId=${digestId}:`,
        error,
      );
    }
  } catch (error) {
    console.warn(
      `[relation-judgment-log] 로그 저장 중 예외 — digestId=${digestId}:`,
      error,
    );
  }
}
