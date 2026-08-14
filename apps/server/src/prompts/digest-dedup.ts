import { z } from "zod";

import type { DigestType } from "@nema-io/shared";

// =============================================================
// 겹치는 카드 걸러내기 — 저장 직전에 완성된 다이제스트 목록을 놓고 한 번 본다(LLM 1콜).
//
// 이 판단을 생성 프롬프트에 얹는 방식은 두 번 실패했다. 그쪽 규칙 2가 "상한은 없다,
// 개수를 줄이려고 합치지 마라"를 강하게 밀고 있어 한 프롬프트 안에서 두 지시가 싸우고,
// 실제로는 겹침과 무관한 판단까지 합쳐지거나 통째로 사라졌다(eval 02·04·11). 단계를
// 나누면 두 지시가 각자 자리에서 온전해지고, 판정 자체도 쉬워진다 — 원문을 읽으며
// "이걸 만들까 말까"를 정하는 것과, 완성된 카드 둘을 놓고 "같은 말인가"를 보는 것은
// 난이도가 다르다.
//
// 원문을 안 넣는다. 이 자리가 쉬운 이유가 입력이 이미 구조화된 카드뿐이라는 데 있어서다 —
// 원문을 같이 넣으면 방금 끝낸 생성 판단을 다시 하게 된다.
//
// 남은 목록을 다시 뱉게 하지 않는다. 뺄 것의 번호와 이유만 받고 실제 제거는 코드가 한다 —
// 목록을 다시 출력하게 하면 그 과정이 재작성이 되어 지어냄이 들어온다(생성 프롬프트를
// 고쳐 잡으려던 두 번의 시도가 그렇게 터졌다). 카드 본문은 LLM을 한 번도 통과하지 않는다.
//
// 콘텐츠 언어를 안 건다. 출력이 번호와 판정 이유뿐인데 그 이유는 저장되지 않고 로그에만
// 남는 개발자용 기록이라 영어로 고정한다(출력이 enum뿐이라 언어 지시가 붙을 자리 자체가
// 없는 관계 판정과 갈리는 대목).
// =============================================================

// 유형을 그 유형이게 하는 칸 — 생성 프롬프트의 "Digest types" 절이 required로 못박은
// 것과 같은 표다. 판정 규칙 1이 "이 칸만 본다"이므로 프롬프트가 이 이름을 알아야 한다.
const REQUIRED_FIELD_BY_TYPE = {
  decision: "choice",
  pending: "question",
  learning: "finding",
  idea: "concept",
  assumption: "assumption",
} as const satisfies Record<DigestType, string>;

const REQUIRED_FIELD_LINES = Object.entries(REQUIRED_FIELD_BY_TYPE)
  .map(([type, field]) => `- ${type}: "${field}"`)
  .join("\n");

export function buildDigestDedupSystemPrompt(): string {
  return `You are given digests pulled from one note, numbered. Each digest is a cleaned-up
write-up of a single judgment the note's author made — something decided, found
out, assumed, proposed, or left open. Each carries one required field holding the
judgment itself, plus optional fields that add detail around it. The required
field, by type:

${REQUIRED_FIELD_LINES}

Sometimes one judgment lands twice: once as an entry inside another digest's
optional field, and again as a digest standing on its own. Find those. Nothing
else.

## Default: keep

Every digest here was written on purpose, and whatever you report is deleted for
good — the author never sees it again. So the answer you reach for is "keep", and
an empty list is a normal, common outcome. Report a digest only when you can name
the exact field of another digest that already carries it. If you cannot name
that field, or you are still weighing whether it is close enough, keep it.

You are not shortening this list. A long list is not a problem to be solved here.

## When one digest is contained in another

Report digest A as contained in digest B only when BOTH of these hold.

1. A's required field says the same thing as ONE entry in ONE of B's optional
   fields. Not spread across several of B's fields, not something B's fields add
   up to when taken together — one entry, making the same claim.
2. A carries nothing that entry does not already carry. If A's own optional
   fields hold anything further — evidence behind it, what it costs, what it
   changes, what would settle it, an option that was passed over — then A stays,
   however closely the two read.

## What is not containment

- **Same subject.** Two digests about one feature, one person, one meeting are
  not duplicates of each other.
- **One leading to the other.** A finding that is why some question is still
  open. An assumption a decision rests on. A learning that came out of the same
  discussion. These are separate judgments that happen to touch, and the note is
  poorer without either of them.
- **Sounding alike.** Two sentences of similar shape are not the same statement.
  Ask whether the claim is the same, not whether the wording is.
- **A match against B's required field, or against B's title.** Only B's optional
  fields can contain A. Two digests making the same claim in their required
  fields is a different problem, and not yours.
- **A match between optional fields.** Only the required field of the digest you
  would remove counts.

## Output

For each containment you find:

  "digest"       number of the digest that is contained — the one removed
  "containedIn"  number of the digest that already carries it — the one kept
  "field"        name of B's field holding it, exactly as it appears
  "reason"       one short sentence, in English, on why these make the same claim

{ "duplicates": [{ "digest", "containedIn", "field", "reason" }] }

Report each digest at most once, and never report a digest that you are also
naming as the container for something else — removing a container takes the
contained judgment down with it.`;
}

// 프롬프트는 카드를 JSON으로 찍기만 해서 body의 실제 모양을 안 본다. Digest["body"]로
// 좁히지 않고 object로 열어두면 eval 실행기가 (프로덕션과 달리) reasoning 칸이 붙은
// 항목을 자기 타입 그대로 넘길 수 있다.
export interface DedupDigest {
  type: DigestType;
  title: string;
  body: object;
}

export function buildDigestDedupMessage(
  digests: readonly DedupDigest[],
): string {
  const blocks = digests.map(
    (digest, index) => `<digest number="${index + 1}">
${JSON.stringify({ type: digest.type, title: digest.title, ...digest.body })}
</digest>`,
  );
  return `<digests>
${blocks.join("\n")}
</digests>`;
}

// 후보 번호로 답을 받는다 — 저장 전이라 id가 아직 없기도 하고, 번호는 범위 검사로
// 어긋남이 바로 드러난다(관계 판정과 같은 이유).
const DuplicateSchema = z.object({
  digest: z.number().int(),
  containedIn: z.number().int(),
  field: z.string(),
  reason: z.string(),
});

export type Duplicate = z.infer<typeof DuplicateSchema>;

export const DigestDedupSchema = z.object({
  duplicates: z.array(DuplicateSchema),
});
