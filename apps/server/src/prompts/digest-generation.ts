import { z } from "zod";

import { DIGEST_TYPES, REFERENCE_TYPES } from "@nema-io/shared";

// =============================================================
// Digest 생성 — source body를 사람이 읽기 좋은 정리본 후보로 (LLM 1콜)
//
// 07-modeling의 Digest·DigestBody 정의가 뼈대. 한 뭉치 안에 여러 판단 유형이
// 섞여 있으면 유형별로 쪼갠다. 원문에 없으면 비워두고 지어내지 않는다.
// 기존 레지스트리(Topic·Tag·Reference)를 보여줘 재사용을 유도한다 — Reference는
// 라벨(E0…)로만 가리키게 해 uuid 환각을 막는다(relation-judgment과 같은 수법).
// 세부 문구·경계는 dogfooding에서 실제 데이터로 보정한다.
// =============================================================

export const DIGEST_GENERATION_SYSTEM_PROMPT = `You turn a user's raw note into digests — cleaned-up, readable write-ups of the judgments the note contains. The raw note is preserved elsewhere untouched; your digests are what the user will actually read later.

## Digest types

Each digest captures ONE judgment, classified as:

- "decision": something was decided. Fields — situation (what had to be decided), choice (what was decided), reason (why), tradeoff (what was accepted as a cost), alternatives (considered but rejected).
- "pending": something is not yet decided. Fields — question (what remains undecided), background (why this question arose), branches (candidate directions under consideration), resolutionCondition (what would settle it).
- "learning": something was found out. Fields — finding (what was confirmed), evidence (what supports it).
- "idea": something was thought up. Fields — concept (the idea itself), background (why it came up), branches (derived possibilities).
- "assumption": something is being treated as true without verification. Fields — assumption (what is assumed), evidence (why it is believed, may be weak), impact (what changes if it turns out false), verificationCondition (what would prove it right or wrong).

## Rules

1. One digest = one judgment. If a note mixes several judgment types — a decision here, an open question there — split them into separate digests. A short note with a single judgment yields exactly one digest.
2. Fill only what the note says. Every body field is optional: when the note does not state a reason, a tradeoff, or evidence, set that field to null. Never invent, never pad. Fields that do not belong to the digest's type MUST be null.
3. "title" is a short headline; "description" is a one-line summary shown under the title in a feed. Both must be understandable without reading the note.
4. Write title, description, and all body fields in the same language as the note.
5. A note that contains no judgment at all (greetings, filler, pure diary) yields an empty "digests" array. Do not force digests out of noise.

## Topics and tags

- "topics": narrow, self-explanatory subject labels used to group digests into threads (e.g. "배포 도구 선정", "온보딩 개편"). Reuse a label from <existing_topics> whenever the digest belongs to that thread; coin a new one only when nothing fits. Usually one topic; several only when the digest genuinely spans subjects.
- "tags": abstract methodology labels that cut across subjects (e.g. "경쟁전략", "기술결정"). Each tag carries a definition ("description") that states when it applies. Reuse titles from <existing_tags> when the definition fits; when proposing a new tag, write a definition precise enough to judge future reuse by. Tags are optional — most digests have none.

## References

References are registry entries for things the note keeps coming back to: a person, an organization, a project, a product, or a term of art.

- When the note mentions something listed in <existing_references>, cite it by putting its label (e.g. "E2") in that digest's "existingReferenceLabels". Never invent labels not present in the list.
- When the note clearly introduces a NEW recurring entity worth a registry entry, add it to the top-level "newReferences" with a short key you make up (e.g. "R1"), its type ("person" | "organization" | "project" | "product" | "term"), its name as "title", and a "body" that captures what the note says about it. Then cite that key in the digest's "newReferenceKeys". "organization" is an acting entity (a company, a team); "product" is a thing an entity makes — they are different registry entries.
- When the note carries a link that identifies the entity itself (its homepage, LinkedIn, repo, docs), put it in that reference's "externalUrls". These are the entity's representative links, not links the digest merely discusses. Do not fabricate URLs.
- Passing mentions that will never recur do not deserve a reference. When unsure, do not create one.

## External URLs

Collect URLs that appear in the note (Slack links, Notion pages, articles) into the digest that discusses them, as "externalUrls". Do not fabricate URLs.

## Output

JSON object:
{ "digests": [{ "type", "title", "description",
    "situation", "choice", "reason", "tradeoff", "alternatives",
    "question", "background", "branches", "resolutionCondition",
    "finding", "evidence", "concept",
    "assumption", "impact", "verificationCondition",
    "topics": [string], "tags": [{ "title", "description" }],
    "existingReferenceLabels": [string], "newReferenceKeys": [string],
    "externalUrls": [string] }],
  "newReferences": [{ "key", "type", "title", "body", "externalUrls": [string] }] }

Order digests by where their judgment first appears in the note.`;

// 구조화 출력 호환을 위해 body 필드를 평평하게 받는다(전 필드 nullable) —
// 판별 유니언으로의 조립·타입 밖 필드 폐기는 워커의 normalize가 맡는다.
const GeneratedDigestSchema = z.object({
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
  topics: z.array(z.string()),
  tags: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    }),
  ),
  existingReferenceLabels: z.array(z.string()),
  newReferenceKeys: z.array(z.string()),
  externalUrls: z.array(z.string()),
});

export type GeneratedDigest = z.infer<typeof GeneratedDigestSchema>;

const GeneratedReferenceSchema = z.object({
  key: z.string().trim().min(1),
  type: z.enum(REFERENCE_TYPES),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  externalUrls: z.array(z.string()),
});

export type GeneratedReference = z.infer<typeof GeneratedReferenceSchema>;

// 빈 배열 허용 — 판단이 없는 글(인사말·잡담)은 Digest가 안 나오는 게 정의
export const DigestGenerationSchema = z.object({
  digests: z.array(GeneratedDigestSchema),
  newReferences: z.array(GeneratedReferenceSchema),
});

interface ExistingReferenceContext {
  label: string;
  type: string;
  title: string;
}

interface ExistingTagContext {
  title: string;
  description: string;
}

export function buildDigestGenerationMessage(
  body: string,
  context: {
    existingTopics: string[];
    existingTags: ExistingTagContext[];
    existingReferences: ExistingReferenceContext[];
  },
): string {
  const parts: string[] = [];
  if (context.existingTopics.length > 0) {
    parts.push(
      `<existing_topics>\n${context.existingTopics.join("\n")}\n</existing_topics>`,
    );
  }
  if (context.existingTags.length > 0) {
    const lines = context.existingTags.map(
      (tag) => `${tag.title}: ${tag.description}`,
    );
    parts.push(`<existing_tags>\n${lines.join("\n")}\n</existing_tags>`);
  }
  if (context.existingReferences.length > 0) {
    const lines = context.existingReferences.map(
      (reference) =>
        `${reference.label} · ${reference.type} · ${reference.title}`,
    );
    parts.push(
      `<existing_references>\n${lines.join("\n")}\n</existing_references>`,
    );
  }
  parts.push(`<note>${body}</note>`);
  return parts.join("\n");
}
