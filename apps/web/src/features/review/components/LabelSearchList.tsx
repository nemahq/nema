import type { ReactNode } from "react";

import { Badge, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface LabelSearchListProps {
  trimmedQuery: string;
  hasCandidates: boolean;
  // 후보가 0개인 원인을 가른다 — "일치 항목 없음"과 "이미 다 붙어서 남은 게
  // 없음"은 서로 다른 상태라 같은 문구를 쓰면 잘못된 신호가 된다.
  hasAnyLabel: boolean;
  hasExactMatch: boolean;
  canCreate: boolean;
  onStartCreate: (name: string) => void;
  children: ReactNode;
}

// Notion처럼 팝오버 전체가 하나의 편집 표면이라, 별도 팝오버로 검색 결과를 또
// 띄우지 않고 같은 화면에 바로 이어 붙인다. "새로 만들기" 행은 raw button —
// 전체 폭 hover 행이라 weave Button의 고정 패딩·타이포가 안 맞는다
// (weave-usage.md Button 표 "칩·pill 안 버튼" 제외 규칙과 같은 이유).
export function LabelSearchList({
  trimmedQuery,
  hasCandidates,
  hasAnyLabel,
  hasExactMatch,
  canCreate,
  onStartCreate,
  children,
}: LabelSearchListProps) {
  const { t } = useTranslation();

  return (
    <>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {children}
        {!hasCandidates && trimmedQuery === "" && (
          <Text as="li" size="sm" color="tertiary" className="px-2 py-1">
            {t(
              hasAnyLabel
                ? "review.label_search_all_added"
                : "review.label_search_empty",
            )}
          </Text>
        )}
      </ul>
      {trimmedQuery !== "" && !hasExactMatch && (
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => onStartCreate(trimmedQuery)}
          className="flex w-full items-center gap-1 rounded-sm py-1 text-left hover:bg-surface-raised-hover disabled:pointer-events-none disabled:text-fg-quinary"
        >
          {/* px-2를 안 두는 이유는 후보 행과 동일 — Badge가 이미 자기 패딩을 갖고
              있어 행에 또 주면 이중으로 밀린다. 국문은 label_create_new_before가
              빈 문자열이라 이 값이 특히 중요하다(아니면 Badge 앞에 눈에 띄는
              여백이 생긴다). Badge를 문장 안에 끼우기 위해 앞/뒤 문구를 분리한다 —
              tolgee의 t()는 문자열 파라미터만 받아 컴포넌트를 끼워 넣을 수 없다
              (어순이 언어마다 달라 국문은 뒤쪽, 영문은 앞쪽에 문구가 붙는다). */}
          <Text as="span" size="sm">
            {t("review.label_create_new_before")}
          </Text>
          <Badge variant="outline" shape="rounded" truncated>
            {trimmedQuery}
          </Badge>
          <Text as="span" size="sm">
            {t("review.label_create_new_after")}
          </Text>
        </button>
      )}
    </>
  );
}
