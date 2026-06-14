import { z } from "zod";

import { RelationTypeSchema } from "@nema-io/shared";

// =============================================================
// 관계 판정 — 새 진술 배치 ↔ 후보(기존/형제) 사이 관계 4종 + 이진 확신 (LLM 1콜)
//
// relation-design §5(판단·게이트)·§8(표식 방향)이 뼈대. 게이트(applied/pending)는
// 워커가 type+confident로 가르고(엔진), 프롬프트는 관계 유무·종류·방향·확신만 낸다.
// from/to 방향이 꺼내기 표식을 좌우하므로 방향 규칙을 단정적으로 못박는다.
// 미세 문턱(특히 replaces 교대 판정의 과감함)은 dogfooding 보정에서 데이터로.
// =============================================================

export const RELATION_JUDGMENT_SYSTEM_PROMPT = `You decide how a person's new statements relate to their earlier statements.

Each statement is one atomic unit of their thinking — a claim, a question, or a task. You are given a batch of NEW statements and a set of EXISTING candidate statements that are semantically near them. Find the genuine relations among them.

## The four relation types — and the direction of each

A relation is directional: \`from\` and \`to\` are NOT interchangeable. The direction decides how each statement is later shown, so get it right.

- "supports": \`from\` justifies, is evidence for, or backs \`to\`. (A reason supports the decision it explains: from = the reason, to = the decision.)
- "replaces": \`from\` supersedes \`to\` — \`from\` is the successor, \`to\` becomes the retired/past version. (from = the new direction, to = what is dropped.)
- "resolves": \`from\` answers or closes \`to\`, where \`to\` is a question or an open task. (from = the answer/closing statement, to = the question or task it closes.)
- "conflicts": \`from\` and \`to\` both assert something that cannot both hold right now, and neither retires the other. This one is symmetric — direction does not matter, pick either order.

## Supports — a real reason, not a shared topic

\`supports\` is the easiest relation to over-apply, and a wrong one is the costliest mistake here: it fabricates a "why" the person never wrote. The bar is whether \`from\` is genuinely a reason or evidence for \`to\` — not whether the two are about the same thing.

- Emit \`supports\` only when \`from\`, taken as true, is a ground that argues for \`to\` — a merit, finding, or rationale the author would cite to justify \`to\`. This may be marked ("because", "그래서", "이유는") or just be the plain relationship between a reason and the decision it backs; the reason and its decision can sit in separate statements with no connecting word.
- Do NOT infer support from topical proximity, shared keywords, or two statements merely appearing together. Sharing a subject is not evidence. A decision and a task about the same thing, two parallel facts, or a restatement are not supports.
- \`to\` must be a claim the author holds (a decision, belief, or finding) — evidence backs a claim. A task or a question is never *supported*; it is closed by \`resolves\`. So never emit \`supports\` whose \`to\` is a task or a question.
- Test before emitting: if \`from\` were removed, would \`to\` lose a reason it leans on? If \`from\` is only *related* to \`to\` rather than a ground *for* it, emit nothing.

## Replacement vs conflict — alternation vs contention

This is the hardest and most important call.

- **replaces = alternation.** The new statement knows the old one and deliberately retires it, taking its place: "we're dropping Toss for PortOne" declares itself the successor. The old statement is not wrong — it is *past*. Choose replaces ONLY when this supersession is explicit in the content (a switch, a "no longer", a "now we do X instead"). When confident, this silently tidies history for the person.
- **conflicts = contention.** Two statements each claim to be valid *now*, and they are incompatible — but neither declares it supersedes the other. They just disagree. The system does not judge which is true; it surfaces the clash for the person.
- **When torn between replaces and conflicts, choose conflicts.** Replacement silently hides the older statement as "past"; if no clear alternation was declared, hiding a still-valid statement is the worse error. Conflict always goes to a human anyway.

## Confidence — binary

For each relation output \`confident\`: true or false.

- \`confident: true\` — the relation clearly holds AND its type and direction are unambiguous.
- \`confident: false\` — a relation likely exists, but you are unsure of its type, its direction, or whether it truly holds. This sends it to the person for review.
- If there is NO relation between two statements, do not emit anything for that pair. Most candidate pairs are merely near in meaning and have no relation — be selective.
- Bias toward caution: when in doubt about whether a relation holds, lean to \`confident: false\` or omit it. Never assert a relation you are guessing at.

## Scope

- Every relation MUST involve at least one NEW statement. Do not relate two existing statements to each other — those were already checked when they were new.
- A relation may hold between two new statements (e.g., a decision and its reason in the same note) or between a new and an existing one, in either direction.
- Do not invent statements or restate them. Judge only the relations.

## Example

NEW statements:
[N0] (claim, certain) 결제 연동은 포트원으로 간다. 토스는 접는다.
[N1] (question) 정산 주기는 주간으로 할지 월간으로 할지 정해야 한다.

EXISTING statements:
[E0] (claim, certain) 결제 연동은 토스로 한다.
[E1] (claim, certain) 포트원은 정산 리포트가 약하다는 평이 있다.
[E2] (todo) 결제 연동 PoC를 끝낸다.

Relations:
- { from: "N0", to: "E0", type: "replaces", confident: true } — N0 explicitly drops Toss for PortOne; E0 is the retired version. Alternation is declared.
- { from: "E1", to: "N0", type: "conflicts", confident: false } — E1 (PortOne's reporting is weak) sits uneasily with the move to PortOne, but it is a caveat, not a clean contradiction; unsure, so review.

No relation is emitted for N1 or E2 — being near in topic is not a relation. In particular, do NOT emit \`supports\` from E2 (the PoC task) to N0 just because both concern payments: the note never says the task justifies the decision. A shared topic is not a reason.

## Output

- JSON object: { "relations": [{ "from": label, "to": label, "type": "supports" | "conflicts" | "replaces" | "resolves", "confident": boolean }] }.
- \`from\` and \`to\` are the bracketed labels exactly as given (e.g., "N0", "E2").
- Output an empty array when no genuine relation exists.`;

const RelationProposalSchema = z.object({
  // 라벨(N0/E1…) — 워커가 실제 진술 id로 되돌린다. 모르는 라벨·존재↔존재 쌍은 워커가 버린다.
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  type: RelationTypeSchema,
  confident: z.boolean(),
});

export type RelationProposal = z.infer<typeof RelationProposalSchema>;

// 빈 배열 허용 — 관계가 없는 게 가장 흔한 결과(후보는 뜻이 가까울 뿐).
export const RelationJudgmentSchema = z.object({
  relations: z.array(RelationProposalSchema),
});

// 메시지에 들어갈 라벨 진술. 라벨 부여·id 매핑은 워커 몫(프롬프트는 포맷만).
// type·confidence는 프롬프트 라인에 박는 표시값일 뿐이라 좁은 enum 대신 string으로
// 둔다(판정 결과는 하류에서 RelationProposalSchema로 다시 검증된다).
export interface LabeledStatement {
  label: string;
  content: string;
  type: string;
  confidence: string | null;
}

function formatStatement(s: LabeledStatement): string {
  const meta = s.confidence ? `${s.type}, ${s.confidence}` : s.type;
  return `[${s.label}] (${meta}) ${s.content}`;
}

export function buildRelationJudgmentMessage(
  newStatements: LabeledStatement[],
  candidateStatements: LabeledStatement[],
): string {
  return [
    "NEW statements:",
    ...newStatements.map(formatStatement),
    "",
    "EXISTING statements:",
    ...candidateStatements.map(formatStatement),
  ].join("\n");
}
