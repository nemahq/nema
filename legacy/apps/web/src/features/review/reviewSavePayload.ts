import type {
  DigestReviewUpdateInput,
  ReviewLabelPalette,
} from "@nema-io/shared";

import type { ReviewDraft } from "@web/features/review/reviewDraft";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import type { ReviewDigest } from "@web/features/review/types";

// 제목·설명만 trim한다 — 타이핑 중에 trim하면 띄어쓰기 자체를 칠 수 없어 초안에는
// 사람이 친 그대로 남기고, 서버로 나가는 이 순간에만 정규화한다. body는 필드마다
// optional이라 공백도 유효한 값으로 보고 trim하지 않는다(서버 DigestBodySchema도
// trim·min(1) 없이 동일하게 취급). Topic/Tag는 이제 팔레트 항목 id 배열이라 여기서
// trim할 대상이 없다 — trimLabelDraft가 팔레트 자체를 trim한다.
function trimDigests(digests: ReviewDigest[]): ReviewDigest[] {
  return digests.map((digest) => ({
    ...digest,
    title: digest.title.trim(),
    description: digest.description.trim(),
  }));
}

function trimLabelDraft(labelDraft: ReviewLabelPalette): ReviewLabelPalette {
  return {
    topics: labelDraft.topics.map((topic) => ({
      ...topic,
      title: topic.title.trim(),
    })),
    tags: labelDraft.tags.map((tag) => ({ ...tag, title: tag.title.trim() })),
  };
}

// digestReview.update 입력 조립 — 자동 저장(디바운스마다)과 확정 직전 마지막 저장이
// 같은 조립 로직을 쓴다. referenceUpdates는 확정 차단 조건과 같은 파생값이라
// computeReviewEditingState를 그대로 불러 뽑는다(병합 후보 선정 로직을 두 곳에
// 흩어두지 않기 위함 — 저장 payload만 필요한 이 자리에서도 그 함수 전체를 부르고
// 필요한 필드만 꺼내 쓴다).
export function buildUpdateReviewPayload(
  draft: ReviewDraft,
): DigestReviewUpdateInput {
  const { referenceUpdates } = computeReviewEditingState(draft);
  return {
    changesetId: draft.changesetId,
    expectedVersion: draft.draftVersion,
    digests: trimDigests(draft.digests),
    labelDraft: trimLabelDraft(draft.labelDraft),
    newReferences: draft.newReferences.map((reference) => ({
      ...reference,
      title: reference.title.trim(),
      body: reference.body.trim(),
    })),
    referenceUpdates: referenceUpdates.map((update) => ({
      ...update,
      mergeNote: update.mergeNote.trim(),
    })),
  };
}
