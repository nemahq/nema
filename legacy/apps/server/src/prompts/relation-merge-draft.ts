import { z } from "zod";

import { DIGEST_TYPES, type DigestBody } from "@nema-io/shared";

import { renderBody } from "@server/prompts/digest-extraction";

// =============================================================
// 중복 병합 초안 생성 — 관계 엔진이 duplicates 쌍을 발견한 그 순간(2단계), 병합된
// Digest 한 장을 미리 써 pending relation changeset에 담아둔다 (eager 생성,
// surface-inventory.md "관계 판정 화면(중복/병합)" — 사람이 판정 화면을 열 때
// LLM을 부르면 이 와이어프레임 전체에서 유일한 로딩 상태가 생겨 일관성이 깨진다).
//
// digest-generation.ts와 같은 결의 출력(type·title·description·body 필드)이지만
// 입력이 원문이 아니라 이미 확정된 두 Digest다. topics·tags·referenceIds·
// externalUrls는 LLM이 새로 판단할 거리가 없는 순수 합집합이라 코드(worker.ts)가
// 기계적으로 처리하고, 여기 프롬프트는 "같은 판단을 하나로 다시 쓰는" 진짜 주관이
// 필요한 부분만 맡는다(deterministic-first).
// =============================================================

export const RELATION_MERGE_DRAFT_SYSTEM_PROMPT = `You are given two digest write-ups, A and B, that an upstream matching step has already determined record the SAME underlying judgment (a decision, an open question, a finding, an idea, or an assumption) — not two related judgments, the same one written twice. Merge them into ONE digest write-up that keeps every distinct piece of information from both and drops nothing, resolving any overlap into a single coherent account.

## Digest types

Classify the merged judgment as one of:

- "decision": something was decided. Fields — situation, choice, reason, tradeoff, alternatives.
- "pending": something is not yet decided. Fields — question, background, branches, resolutionCondition.
- "learning": something was found out. Fields — finding, evidence.
- "idea": something was thought up. Fields — concept, background, branches.
- "assumption": something is being treated as true without verification. Fields — assumption, evidence, impact, verificationCondition.

A and B are usually the same type already (they record the same judgment); pick that type. In the rare case they were classified differently, pick whichever type the merged content actually fits.

## Rules

1. Fill only what A or B actually state. Every body field is optional: when neither states a reason, a tradeoff, or evidence, set that field to null. Never invent, never pad. Fields that do not belong to the merged digest's type MUST be null.
2. When A and B state the same fact, keep it once. When one adds something the other lacks (a reason A has that B doesn't, a tradeoff only B mentions), fold it in — the merged write-up must not lose information either side had.
3. "title" is a short headline; "description" is a one-line summary shown under the title in a feed. Both must be understandable without reading A or B.
4. Write title, description, and all body fields in the same language as A and B (they should already match; if they differ, use A's language).

## Output

JSON object:
{ "type", "title", "description",
  "situation", "choice", "reason", "tradeoff", "alternatives",
  "question", "background", "branches", "resolutionCondition",
  "finding", "evidence", "concept",
  "assumption", "impact", "verificationCondition" }`;

const RelationMergeDraftSchema = z.object({
  type: z.enum(DIGEST_TYPES),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  situation: z.string().nullable(),
  choice: z.string().nullable(),
  reason: z.string().nullable(),
  tradeoff: z.array(z.string()).nullable(),
  alternatives: z.array(z.string()).nullable(),
  question: z.string().nullable(),
  background: z.string().nullable(),
  branches: z.array(z.string()).nullable(),
  resolutionCondition: z.string().nullable(),
  finding: z.string().nullable(),
  evidence: z.string().nullable(),
  concept: z.string().nullable(),
  assumption: z.string().nullable(),
  impact: z.string().nullable(),
  verificationCondition: z.string().nullable(),
});

// 응답 형태 자체는 digest-generation과 같아 스키마명도 그 결을 따르되, 병합은 후보
// 여럿이 아니라 결과 하나뿐이라(review-flow.md "중복 판정 — 병합") 배열로 감싸지 않는다.
export const RelationMergeDraftResponseSchema = z.object({
  merged: RelationMergeDraftSchema,
});

export interface MergeDraftDigestInput {
  title: string;
  description: string;
  body: DigestBody;
}

// digest-extraction.ts의 renderBody를 그대로 재사용 — 그쪽 switch(body.type)에 default가
// 없어 DigestBody에 타입·필드가 늘면 컴파일 에러로 강제된다. 여기서 같은 렌더링을
// 따로 다시 구현하면 그 안전장치를 우회하게 되어(새 필드가 조용히 누락될 수 있음),
// "정보를 하나도 빠뜨리지 않는다"는 이 프롬프트의 약속과 어긋난다.
function formatDigest(label: string, digest: MergeDraftDigestInput): string {
  const bodyText = renderBody(digest.body);
  const header = [
    `[${label}]`,
    `type: ${digest.body.type}`,
    `title: ${digest.title}`,
    `description: ${digest.description}`,
  ].join("\n");
  return bodyText ? `${header}\n\n${bodyText}` : header;
}

export function buildRelationMergeDraftMessage(
  keeper: MergeDraftDigestInput,
  duplicate: MergeDraftDigestInput,
): string {
  return [formatDigest("A", keeper), "", formatDigest("B", duplicate)].join(
    "\n",
  );
}
