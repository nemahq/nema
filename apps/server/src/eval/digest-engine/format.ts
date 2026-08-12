import type { DigestType } from "@nema-io/shared";

// human-review 출력 전용 표시 순서·한글 라벨 — legacy/apps/web/src/features/review/
// constants.ts의 DIGEST_BODY_FIELDS를 그대로 따른다. 실제 앱이 나중에 이 순서·라벨로
// 보여줄 걸 사람 리뷰에서 미리 재현해서, 리뷰 경험이 실제 화면과 어긋나지 않게 한다.

export const DIGEST_TYPE_LABEL: Record<DigestType, string> = {
  decision: "결정",
  pending: "미결",
  learning: "학습",
  idea: "아이디어",
  assumption: "가정",
};

interface DigestFieldSpec {
  key: string;
  label: string;
}

export const DIGEST_BODY_FIELD_ORDER: Record<DigestType, DigestFieldSpec[]> = {
  decision: [
    { key: "situation", label: "상황" },
    { key: "choice", label: "선택" },
    { key: "reason", label: "이유" },
    { key: "tradeoff", label: "트레이드오프" },
    { key: "alternatives", label: "대안" },
  ],
  pending: [
    { key: "question", label: "질문" },
    { key: "background", label: "배경" },
    { key: "branches", label: "선택지" },
    { key: "resolutionCondition", label: "확인 조건" },
  ],
  learning: [
    { key: "finding", label: "발견" },
    { key: "evidence", label: "근거" },
  ],
  idea: [
    { key: "concept", label: "발상" },
    { key: "background", label: "배경" },
    { key: "branches", label: "선택지" },
  ],
  assumption: [
    { key: "assumption", label: "가설" },
    { key: "evidence", label: "근거" },
    { key: "impact", label: "영향" },
    { key: "verificationCondition", label: "검증 조건" },
  ],
};

// reasoning 변형(run-with-reasoning.ts) 전용 — 타입 스키마엔 없는 eval 전용 칸.
export const REASONING_FIELD_LABEL = "판단 이유";
