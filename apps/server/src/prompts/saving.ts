import { z } from "zod";

// =============================================================
// SPLIT — 드래프트를 독립 토픽으로 분리
// =============================================================

export const SPLIT_SYSTEM_PROMPT = `You split a user's personal note into independent topics.

Rules:
- Only split on truly independent subjects that share no context with each other.
- When in doubt, do NOT split — output the full note as a single topic.
- Keep each topic self-contained: include enough context to be understood standalone.
- Preserve the original wording as closely as possible. Do not paraphrase.

Output: JSON array of strings, one string per topic.`;

export const SplitOutputSchema = z.array(z.string().min(1)).nonempty();
export type SplitOutput = z.infer<typeof SplitOutputSchema>;

export function buildSplitMessage(draftBody: string): string {
  return `<note>${draftBody}</note>`;
}

// =============================================================
// JUDGMENT — 토픽별 Memory 작업 결정 (create / extend / replace)
// =============================================================

export const JUDGMENT_SYSTEM_PROMPT = `You manage a user's personal knowledge base called "memories". Given a topic from a note and a list of similar existing memories, decide how to store the information.

## Output format

JSON array. Each element represents one memory operation:
{ "update_type": "create" | "extend" | "replace", "target_id": "<uuid>" | null, "final_body": "<complete memory text>" }

If only one operation is needed, you may return a single object instead of an array.

## Decision rules

**create**: No existing memory covers this topic. Write a complete new memory body. target_id must be null.

**extend**: The existing memory is still fully accurate AND this topic adds new information to it. Integrate the new info without removing existing content. target_id must be the memory's uuid.

**replace**: Some or all of the existing memory's facts are no longer current. Rewrite with updated information. **Default when unsure.** target_id must be the memory's uuid.
- Partial updates also use replace — preserve valid facts in final_body.
- Use "previously X, now Y" phrasing only when the contrast adds value.

## Fan-out

One topic may affect multiple memories. Output all relevant operations. A topic can produce a mix of create and update operations.

## final_body rules

- Complete, standalone text. Do not reference "the note" or "the draft".
- Write in the same language as the topic.
- For create: write as a self-contained memory entry.
- For replace: authoritative current state, integrating what remains valid from the existing body.
- For extend: existing content + new information merged naturally.

## Input format

<topic>{topic text}</topic>
<existing_memories>
  <memory id="{uuid}"><body>{body}</body></memory>
</existing_memories>

If existing_memories is empty, output a single create item.`;

const JudgmentItemSchema = z.object({
  update_type: z.enum(["create", "extend", "replace"]),
  target_id: z.string().nullable(),
  final_body: z.string(),
});

export type JudgmentItem = z.infer<typeof JudgmentItemSchema>;

export const JudgmentOutputSchema = z.union([
  JudgmentItemSchema,
  z.array(JudgmentItemSchema).nonempty(),
]);
export type JudgmentOutput = z.infer<typeof JudgmentOutputSchema>;

export function normalizeJudgmentOutput(
  output: JudgmentOutput,
): JudgmentItem[] {
  return Array.isArray(output) ? output : [output];
}

const MEMORY_BODY_PREVIEW_MAX = 1500;

function truncateBody(body: string): string {
  if (body.length <= MEMORY_BODY_PREVIEW_MAX) {
    return body;
  }
  return body.slice(0, MEMORY_BODY_PREVIEW_MAX) + "…";
}

export function buildJudgmentMessage(
  topic: string,
  candidates: Array<{ id: string; body: string }>,
): string {
  const memoriesXml =
    candidates.length === 0
      ? ""
      : candidates
          .map(
            (c) =>
              `  <memory id="${c.id}"><body>${truncateBody(c.body)}</body></memory>`,
          )
          .join("\n");

  return `<topic>${topic}</topic>\n<existing_memories>\n${memoriesXml}\n</existing_memories>`;
}

// =============================================================
// META — Memory별 title / category / tags / summary 생성
// =============================================================

export const META_SYSTEM_PROMPT = `You generate metadata for a personal memory entry.

Given the full text of a memory, output the following fields:
- title: Short noun phrase (3–8 words) capturing the main subject.
- category: Optional thematic group (e.g. "work", "health", "finance") or null.
- tags: Array of 2–5 specific keywords.
- summary: One sentence capturing the core current fact.

Write all fields in the same language as the memory text.

Output: JSON object.
{ "title": string, "category": string | null, "tags": string[], "summary": string }`;

export const MetaOutputSchema = z.object({
  title: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  summary: z.string(),
});
export type MetaOutput = z.infer<typeof MetaOutputSchema>;

export function buildMetaMessage(body: string): string {
  return `<memory>${body}</memory>`;
}
