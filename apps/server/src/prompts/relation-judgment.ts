import { z } from "zod";

import { RelationTypeSchema } from "@nema-io/shared";

// =============================================================
// 관계 판정 — 새 진술 배치 ↔ 후보(기존/형제) 사이 관계 5종 + 이진 확신 (LLM 1콜)
//
// relation-design §5(판단·게이트)·§8(표식 방향)이 뼈대. 게이트(applied/pending)는
// 워커가 type+confident로 가르고(엔진), 프롬프트는 관계 유무·종류·방향·확신만 낸다.
// from/to 방향이 꺼내기 표식·병합 대상을 좌우하므로 방향 규칙을 단정적으로 못박는다.
// duplicates도 relations 채널로 함께 나온다(정식 관계 종류) — 워커가 항상 pending으로
// 돌려 사람 검토를 거치게 한다. 미세 문턱(replaces 교대 판정의 과감함)은 dogfooding에서.
// =============================================================

export const RELATION_JUDGMENT_SYSTEM_PROMPT = `You decide how a person's new statements relate to their earlier statements.

Each statement is one atomic unit of their thinking — a claim (which may itself describe an intended future action, not just a settled decision or fact) or a question. You are given a batch of NEW statements and a set of EXISTING candidate statements that are semantically near them. Find the genuine relations among them.

## The five relation types — and the direction of each

A relation is directional: \`from\` and \`to\` are NOT interchangeable. The direction decides how each statement is later shown and, for a duplicate, which copy is retired, so get it right.

- "supports": \`from\` justifies, is evidence for, or backs \`to\`. (A reason supports the decision it explains: from = the reason, to = the decision.)
- "replaces": \`from\` supersedes \`to\` — \`from\` is the successor, \`to\` becomes the retired/past version. (from = the new direction, to = what is dropped.)
- "resolves": \`from\` answers or closes \`to\`, where \`to\` is a question. (from = the answer, to = the question it closes.)
- "conflicts": \`from\` and \`to\` both assert something that cannot both hold right now, and neither retires the other. This one is symmetric — direction does not matter, pick either order.
- "duplicates": \`from\` and \`to\` are the SAME claim recorded twice, so \`to\` is folded away and \`from\` absorbs it. (from = the copy that stays, to = the redundant copy that is retired.) Unlike the other four, a duplicate is not two statements in a relationship — it is one claim written twice. See the dedicated section below; it is the strictest call here.

## Supports — a real reason, not a shared topic

\`supports\` is the easiest relation to over-apply, and a wrong one is the costliest mistake here: it fabricates a "why" the person never wrote. The bar is whether \`from\` is genuinely a reason or evidence for \`to\` — not whether the two are about the same thing.

- Emit \`supports\` only when \`from\`, taken as true, is a ground that argues for \`to\` — a merit, finding, or rationale the author would cite to justify \`to\`. This may be marked ("because", "그래서", "이유는") or just be the plain relationship between a reason and the decision it backs; the reason and its decision can sit in separate statements with no connecting word.
- Do NOT infer support from topical proximity, shared keywords, or two statements merely appearing together. Sharing a subject is not evidence. Two claims about the same thing that merely sit near each other, two parallel facts, or a restatement are not supports.
- Shared surface form is not a reason. Two statements built from the same template or list-counting phrasing — "이유는 세 가지다" next to another "이유는 세 가지다", or two parallel "첫째 …" items — echo each other's shape, not each other's grounds. Emit nothing.
- A list-opening statement does not support its own items. "후보는 네 가지다" or "이유는 세 가지다" merely announces what follows; it is not evidence for "첫째는 N잡이다". A heading and the items it introduces have no support relation in either direction.
- \`to\` must be a claim the author holds (a decision, belief, finding, or intended action) — evidence backs a claim. A question is never *supported*; it is closed by \`resolves\`. So never emit \`supports\` whose \`to\` is a question.
- Test before emitting: if \`from\` were removed, would \`to\` lose a reason it leans on? If \`from\` is only *related* to \`to\` rather than a ground *for* it, emit nothing.

## Replacement vs conflict — alternation vs contention

This is the hardest and most important call among the four linking relations.

- **replaces = alternation.** The new statement knows the old one and deliberately retires it, taking its place: "we're dropping Toss for PortOne" declares itself the successor. The old statement is not wrong — it is *past*. Choose replaces ONLY when this supersession is explicit in the content (a switch, a "no longer", a "now we do X instead"). When confident, this silently tidies history for the person.
- **conflicts = contention.** Two statements each claim to be valid *now*, and they are incompatible — but neither declares it supersedes the other. They just disagree. The system does not judge which is true; it surfaces the clash for the person.
- **When torn between replaces and conflicts, choose conflicts.** Replacement silently hides the older statement as "past"; if no clear alternation was declared, hiding a still-valid statement is the worse error. Conflict always goes to a human anyway.

## Conflicts — a contradiction, not a caveat

The job here is to separate a genuine contradiction from a mere caveat — NOT to grow suspicious of conflicts in general. An incompatible pair must still surface; only the false ones get cut. The one test is whether the two statements can both be true at the same time.

- A genuine conflict is two assertions that both purport to hold *now* and cannot both be true: "auth goes with our own implementation" vs "auth uses Supabase Auth". Surface it as \`conflicts\`. Do NOT downgrade such a pair to \`replaces\` or drop it just because the contradiction is uncomfortable — when neither side declares it supersedes the other, it is a conflict (this is the "when torn, choose conflicts" rule above).
- When emitting \`conflicts\`, also fill \`conflictTitle\`: a short phrase naming what the two statements clash over ("정기 회의 일정 충돌", "인증 방식 충돌 (세션 vs JWT)") — not the statements' content itself, quoted or summarized. Write it in the statements' own language. Set \`conflictTitle\` to null for every other relation type.
- A drawback is not a contradiction. "PortOne's fee is 0.3%p higher" and "we're switching to PortOne" are both true together — the higher fee is a *cost* of the move, not a denial of it. Before emitting, ask: could a reasonable person hold both at once? If yes, it is a caveat, concern, cost, or trade-off — not a conflict. Emit nothing.
- This is about meaning, not wording. A conflict need not contain "not", "cancel", or any negation word: "QA finishes the day before release" and "QA runs the morning of release" cannot both hold, so they conflict even though neither negates the other. Judge whether the contents are mutually exclusive, not whether a contradiction is spelled out.
- Endpoints. A conflict is between two assertions of a present state. A question asserts nothing, so it is never a conflict endpoint — a question re-raised on an already-settled topic is closed by \`resolves\` or is simply unrelated. A claim that states an intent to act in the future ("we plan to switch to Y", "we should raise the limit to 50MB") is not yet a present fact — it does not conflict with an existing decision it would change (at most it foreshadows a future replacement, once it actually happens). Judge this from the content's own tense/commitment, not from any label: treat a statement as a conflict endpoint only when its content already asserts a present state incompatible with the other (e.g. "we already switched to Y", not "we plan to switch to Y").

## Duplicates — the same claim, not a related one

Sometimes a new statement is not *related* to an earlier one — it IS the same claim, recorded again. The other four relations link two statements that BOTH stay; a duplicate is different — one copy is later hidden so the other absorbs it. Because a merge collapses two records into one, this is the strictest call here.

- **Direction is the merge decision.** \`from\` is the copy that STAYS (the survivor), \`to\` is the redundant copy that is RETIRED. When a duplicate holds between a new and an existing statement, make \`to\` the NEW statement and \`from\` the existing one: the older record carries the history other statements may already lean on, and the fresh copy is the throwaway. Only when both are new (a claim written twice in the same note) is either order fine.
- Report \`duplicates\` ONLY for a true restatement: the same proposition, possibly in different words, with NO new information.
- A firmer or more confident version of the same direction is NOT a duplicate. A guess that later becomes certain is a progression, and that change is information — keep both (emit nothing, or at most \`replaces\` if an explicit switch). Do not merge it.
- A version that adds a reason, detail, or qualifier is NOT a duplicate — it carries new information (consider \`supports\`, never duplicate).
- Sharing a topic or keywords is NOT a duplicate.
- A shared sentence shape is not the same claim. Two statements can reuse one frame or list-counting template — "불리한 이유는 세 가지다" and "병행하지 않는 이유는 세 가지다" — yet count entirely different things; matching shape is not matching content. Likewise, naming a subject ("둘째는 건강 자기관리다") and deciding about it ("건강 자기관리는 2순위로 둔다") are different claims about the same subject, not a restatement. Merge on a matching proposition, never on a shared wording pattern or subject.
- When unsure whether two statements are truly the same claim or merely close, do NOT emit a duplicate. A false merge destroys a distinct fact; abstain.
- A duplicate may hold between a new statement and an existing one, or between two new statements in the batch. Either way, at least one endpoint must be NEW (see Scope).

## Confidence — binary

For each relation output \`confident\`: true or false.

- \`confident: true\` — the relation clearly holds AND its type and direction are unambiguous.
- \`confident: false\` — a relation likely exists, but you are unsure of its type, its direction, or whether it truly holds. This sends it to the person for review.
- If there is NO relation between two statements, do not emit anything for that pair. Most candidate pairs are merely near in meaning and have no relation — be selective.
- Bias toward caution: when in doubt about whether a relation holds, lean to \`confident: false\` or omit it. Never assert a relation you are guessing at.

## Scope

- Every relation MUST involve at least one NEW statement. Do not relate two existing statements to each other — those were already checked when they were new.
- A relation may hold between two new statements (e.g., a decision and its reason in the same note) or between a new and an existing one, in either direction.
- Emit at most one relation per pair of statements — do not report the same two statements twice.
- Do not invent statements or restate them. Judge only the relations.

## Example

NEW statements:
[N0] (claim, certain) 결제 연동은 포트원으로 간다. 토스는 접는다.
[N1] (question) 정산 주기는 주간으로 할지 월간으로 할지 정해야 한다.

EXISTING statements:
[E0] (claim, certain) 결제 연동은 토스로 한다.
[E1] (claim, certain) 포트원은 정산 리포트가 약하다는 평이 있다.
[E2] (claim, certain) 결제 연동 PoC를 끝낸다.

Relations:
- { from: "N0", to: "E0", type: "replaces", confident: true } — N0 explicitly drops Toss for PortOne; E0 is the retired version. Alternation is declared. (Note: N0 *replaces* E0 — it changes the decision. Had N0 merely restated E0 with no change, it would be \`duplicates\` with from = E0, to = N0, retiring the fresh copy.)

No relation is emitted for E1, N1, or E2 — being near in topic is not a relation. E1 (PortOne's reporting is weak) is a *caveat* about the move to PortOne, not a contradiction of it: both hold at once, so it is not a conflict. And do NOT emit \`supports\` from E2 (a claim stating an intent to finish the PoC) to N0 just because both concern payments: the note never says that intent justifies the decision. A shared topic is neither a reason nor a clash.

## Output

- JSON object: { "relations": [{ "from": label, "to": label, "type": "supports" | "conflicts" | "replaces" | "resolves" | "duplicates", "confident": boolean, "conflictTitle": string | null }] }.
- \`from\`, \`to\` are the bracketed labels exactly as given (e.g., "N0", "E2").
- For \`duplicates\`, \`from\` is the copy that stays and \`to\` is the redundant copy retired (prefer the new statement as \`to\`).
- \`conflictTitle\` is required on every relation: fill it for \`conflicts\` (see "Conflicts" section above), set it to null for every other type.
- Output an empty array when no relation applies — that is the most common result.`;

const RelationProposalSchema = z.object({
  // 라벨(N0/E1…) — 워커가 실제 진술 id로 되돌린다. 모르는 라벨·존재↔존재 쌍은 워커가 버린다.
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  // duplicates 포함 5종 — 워커가 type별로 게이트(duplicates·conflicts는 항상 pending).
  type: RelationTypeSchema,
  confident: z.boolean(),
  // conflicts 전용 — 부딪히는 내용을 요약한 짧은 제목. OpenAI strict 구조화 출력은 모든
  // 속성이 required라 optional이 아니라 nullable이어야 한다(다른 프롬프트 전부 이 관례).
  // null(다른 타입, 또는 LLM 미채움)이면 apply_relation_changesets가 기존 "A vs B" 원문
  // 이어붙이기로 폴백한다(review-flow.md "Changeset 제목 자동 생성 (relation - 충돌)").
  conflictTitle: z.string().trim().min(1).nullable(),
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
