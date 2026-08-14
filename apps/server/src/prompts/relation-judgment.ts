import { z } from "zod";

import type { Digest, DigestRelationType } from "@nema-io/shared";

import type { RelationJudgment } from "@server/services/relation-rules";

// =============================================================
// 관계 판정 — 새 다이제스트 하나와 후보들의 관계를 한 번에 가른다(LLM 1콜).
//
// 후보마다 따로 부르지 않는다. "이 다이제스트와 아래 후보들 각각의 관계를 판정하라"로
// 한 번에 물으면 후보 다섯이어도 1,000토큰 남짓이라 무게가 안 문제다.
// 거르기 단계(linking.md 2.3의 두 걸음)도 두지 않는다 — 진술 대신 다이제스트 전체를
// 임베딩하는 지금은 유사도 점수 자체가 "펼쳐볼 가치"의 근사치라 같은 정보를 두 번 본다.
//
// 콘텐츠 언어를 안 건다. 이 판정의 출력은 enum과 후보 번호뿐이라 문장이 안 나온다 —
// 언어 지시가 붙을 자리가 없다(정리 프롬프트와 갈리는 대목).
// =============================================================

const NO_RELATION = "none";

export function buildRelationJudgmentSystemPrompt(
  judgment: RelationJudgment,
  relationTypes: readonly DigestRelationType[],
): string {
  const options = [...relationTypes, NO_RELATION]
    .map((option) => `"${option}"`)
    .join(", ");

  return `You are given one new digest and a numbered list of candidate digests already
stored. For each candidate, judge how it relates to the new digest.

A digest is a cleaned-up write-up of one judgment the user made: what was
decided, found out, assumed, proposed, or left open. "type" tells you which.

${judgment.question}

## How to answer

One verdict per candidate, using the candidate's number. Judge each candidate
against the new digest on its own — candidates do not relate to each other.

"relation" is one of: ${options}.

Each candidate line lists which relations are allowed for that pair. Anything
outside that list is not available for that candidate; when in doubt use
"${NO_RELATION}".

"from" names which of the two is the giving side — the one doing the supporting
or weakening. Answer it ONLY when the candidate line says "from: ask"; leave it
null otherwise, including when the relation is "${NO_RELATION}". When you do
answer it, decide from what the two digests say, never from which came first.`;
}

interface CandidateForPrompt {
  digest: Pick<Digest, "type" | "title" | "body">;
  allowedTypes: readonly DigestRelationType[];
  asksFrom: boolean;
}

export function buildRelationJudgmentMessage(args: {
  digest: Pick<Digest, "type" | "title" | "body">;
  candidates: CandidateForPrompt[];
}): string {
  const { digest, candidates } = args;

  const candidateBlocks = candidates.map((candidate, index) => {
    const allowed = [...candidate.allowedTypes, NO_RELATION].join(" | ");
    const from = candidate.asksFrom ? "ask" : "null";
    return `<candidate number="${index + 1}" allowed="${allowed}" from="${from}">
${renderDigest(candidate.digest)}
</candidate>`;
  });

  return `<new>
${renderDigest(digest)}
</new>
<candidates>
${candidateBlocks.join("\n")}
</candidates>`;
}

function renderDigest(digest: Pick<Digest, "type" | "title" | "body">): string {
  return JSON.stringify({
    type: digest.type,
    title: digest.title,
    ...digest.body,
  });
}

// 후보 번호로 답을 받는다 — uuid를 그대로 받으면 한 글자만 어긋나도 짝을 잃는데,
// 그게 조용한 누락으로만 보인다. 번호는 범위 검사로 어긋남이 바로 드러난다.
// OpenAI 구조화 출력이 optional을 안 받아 from은 nullable로 둔다(정리 프롬프트와 같음).
export function buildRelationJudgmentSchema(
  relationTypes: readonly DigestRelationType[],
) {
  const options = [...relationTypes, NO_RELATION];
  return z.object({
    verdicts: z.array(
      z.object({
        candidate: z.number().int(),
        relation: z.enum(options),
        from: z.enum(["new", "candidate"]).nullable(),
      }),
    ),
  });
}

export function isRelationType(
  value: string,
  relationTypes: readonly DigestRelationType[],
): value is DigestRelationType {
  return (relationTypes as readonly string[]).includes(value);
}
