import type { DigestBody } from "@nema-io/shared";

// =============================================================
// Digest → Statement 추출 (LLM 1콜)
//
// v2 파이프라인 2단계: 입력이 원문 프로즈가 아니라 사람이 확정한 구조화 Digest다.
// Digest는 유형(decision/pending/learning/idea/assumption)별로 칸이 나뉜 판별 유니언 —
// 유형·칸을 살려 프롬프트에 먹이고, 그 위에서 진술로 절단한다.
//
// 절단 원칙(ingestion-design 3장)은 그대로 뼈대이되, 입력이 이미 정리·확정된 정제물이라
// 무게가 옮겨간다: 노이즈 제거·자기완결은 거의 무의미해지고(digest에 잡담·대명사가 없다),
// 분할·기한·확신도 판정은 그대로 필요하다(한 칸에 판단이 둘 들어있을 수 있고, 칸 텍스트에
// "금요일까지"가 남아있을 수 있으며, 유형이 확신도의 강한 신호가 된다).
//
// 출력 계약(순서·언어·형태)과 스키마는 원문 추출과 동일 — StatementExtractionSchema 재사용.
// 세부 문구·경계값은 eval 하니스에서 실데이터로 보정한다.
// =============================================================

export const DIGEST_EXTRACTION_SYSTEM_PROMPT = `You break a confirmed digest into statements — the atomic units of the user's thinking.

A digest is a cleaned-up, human-confirmed write-up of ONE judgment, already classified by type and organized into fields. Your job is to extract the searchable statements it contains. Statements are stored and searched individually, so each must stand on its own.

## Statement types

- "claim": something held to be the case — a decision, a fact, a finding, an opinion, an assumption, or an intended action.
- "question": something still open — an undecided issue, even when not phrased as a question.

## Confidence (claims only, else null)

- "certain": stated as settled — a decision made, a finding asserted.
- "guess": tentative — assumed, hedged, or a possibility not yet verified.

Let the digest's type steer confidence:
- "decision" / "learning": the choice, its reason, tradeoffs, alternatives, the finding and its evidence are asserted → usually "certain" (unless the field wording hedges).
- "assumption": the assumption and its (possibly weak) evidence are held WITHOUT verification → "guess".
- "idea": a proposal, not a settled fact → "guess".
- "pending": the open question is a "question"; anything factual in its background is a claim.

## What each type yields

- **decision** — choice → the decision as a claim. reason → its own claim, carrying the full subject ("the reason X was chosen is Y", never a bare "the reason is Y"). Each tradeoff and each rejected alternative → its own claim. situation is setup: extract it only if it states a decision-relevant fact worth searching later, otherwise drop it.
- **pending** — question → a "question" statement. background → a claim only if it states a fact. Each branch is an option being weighed: fold it into the question unless it is a distinct decidable sub-question of its own. resolutionCondition → a claim about what would settle it, when it carries information beyond restating the question.
- **learning** — finding → a claim. evidence → its own claim, carrying the subject ("the evidence for Z is W").
- **idea** — concept → a claim ("guess"). Each branch → its own claim only if it is a distinct derived possibility.
- **assumption** — assumption → a claim ("guess"). evidence → its own claim. impact → a claim about what changes if it is wrong. verificationCondition → a claim about what would prove it right or wrong.

## Cutting rules

1. One statement = one "why". If a single field carries two judgments, split it ("chose A and dropped B" → "chose A" + "B was dropped"). If several fields elaborate one point, they still become their own statements when each could be searched — or become outdated — on its own. A decision and its reason are already separate fields; keep them separate.
2. Carry the full subject into every piece — each statement must read on its own without the digest around it.
3. No summarizing, no inventing. Use only what the digest's fields say; polish wording, add nothing. Do not exaggerate certainty beyond what the field states.
4. The title and description are the digest's headline and one-line summary. Treat them as context, not as sources of statements — do not emit a statement that merely restates the headline. Extract from the body fields.
5. An empty field yields nothing. If the digest's fields carry no extractable judgment, output an empty array.

## Deadlines

A statement may carry a deadline stated IN its field text ("금요일까지", "이번 주 안에"). Set "deadline" to a token when the text says when a task or obligation is due; otherwise null. Most statements have none → null.

A deadline token: { "boundary", "anchorKind", "grain", "offset", "weekday", "scope", "date" }

- "boundary": "by" — due by a point ("금요일까지"). "within" — due within a period ("이번 주 안에").
- "anchorKind" picks which remaining fields are set; the rest MUST be null:
  - "relative": "grain" ("day" | "week" | "month" | "quarter") + "offset" (this=0, next=+1, last=-1).
  - "weekday": "weekday" ("mon".."sun") + "scope" ("this" | "next").
  - "absolute": "date" ("YYYY-MM-DD"). When the year is omitted, resolve it against <today>, picking the nearest sensible occurrence.

## Output

- JSON object: { "statements": [{ "content": string, "type": "claim" | "question", "confidence": "certain" | "guess" | null, "deadline": <token> | null }] }
- Order statements by where their field appears in the digest (title/description first, then body fields in the order shown).
- Write each statement's content in the same language as the digest.
- Content must contain only the statement text — no field labels, no XML markup.`;

// --- DigestBody를 유형·칸 라벨을 살려 텍스트로 렌더 ---
// 빈 칸(undefined)은 지운다 — 프롬프트가 "빈 칸은 없는 것"으로 읽게. 라벨은 프롬프트의
// 유형별 가이드와 같은 어휘(situation/choice…)를 써 모델이 칸과 규칙을 맞물리게 한다.

function renderBody(body: DigestBody): string {
  const lines: string[] = [];
  const text = (label: string, value: string | undefined): void => {
    if (value && value.trim()) {
      lines.push(`${label}: ${value.trim()}`);
    }
  };
  const list = (label: string, values: string[] | undefined): void => {
    const items = (values ?? []).map((v) => v.trim()).filter((v) => v !== "");
    if (items.length > 0) {
      lines.push(`${label}:`);
      for (const entry of items) {
        lines.push(`- ${entry}`);
      }
    }
  };

  switch (body.type) {
    case "decision":
      text("situation", body.situation);
      text("choice", body.choice);
      text("reason", body.reason);
      list("tradeoff", body.tradeoff);
      list("alternatives", body.alternatives);
      break;
    case "pending":
      text("question", body.question);
      text("background", body.background);
      list("branches", body.branches);
      text("resolutionCondition", body.resolutionCondition);
      break;
    case "learning":
      text("finding", body.finding);
      text("evidence", body.evidence);
      break;
    case "idea":
      text("concept", body.concept);
      text("background", body.background);
      list("branches", body.branches);
      break;
    case "assumption":
      text("assumption", body.assumption);
      text("evidence", body.evidence);
      text("impact", body.impact);
      text("verificationCondition", body.verificationCondition);
      break;
  }

  return lines.join("\n");
}

// todayIsoDate는 절대 날짜 연도 보정·기한 해석 기준 = 원문의 작성일(존 반영). 원문 추출과
// 같은 계약이라 워커가 같은 값을 넘긴다.
export function buildDigestExtractionMessage(
  digest: { title: string; description: string; body: DigestBody },
  options?: { todayIsoDate?: string },
): string {
  const parts: string[] = [];
  if (options?.todayIsoDate) {
    parts.push(`<today>${options.todayIsoDate}</today>`);
  }
  const header = [`type: ${digest.body.type}`];
  if (digest.title.trim()) {
    header.push(`title: ${digest.title.trim()}`);
  }
  if (digest.description.trim()) {
    header.push(`description: ${digest.description.trim()}`);
  }
  const bodyText = renderBody(digest.body);
  const inner = bodyText
    ? `${header.join("\n")}\n\n${bodyText}`
    : header.join("\n");
  parts.push(`<digest>\n${inner}\n</digest>`);
  return parts.join("\n");
}
