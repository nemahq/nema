import type { ReactNode } from "react";

import { Badge, cn, ComboboxItem, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface LabelSearchListProps {
  trimmedQuery: string;
  hasCandidates: boolean;
  hasExactMatch: boolean;
  canCreate: boolean;
  onStartCreate: (name: string) => void;
  children: ReactNode;
}

// Notion처럼 팝오버 전체가 하나의 편집 표면이라, 별도 팝오버로 검색 결과를 또
// 띄우지 않고 같은 화면에 바로 이어 붙인다.
export function LabelSearchList({
  trimmedQuery,
  hasCandidates,
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
        {/* 이미 붙은 후보도 목록에서 안 빠지므로(LabelSearchRow) "이미 모두
            추가했어요"는 도달할 일이 없다 — 후보가 0개면 워크스페이스에 활성
            라벨 자체가 없다는 뜻뿐이라 문구를 하나로 통일한다. */}
        {!hasCandidates && trimmedQuery === "" && (
          <Text as="li" size="sm" color="tertiary" className="px-2 py-1">
            {t("review.label_search_empty")}
          </Text>
        )}
      </ul>
      {trimmedQuery !== "" && !hasExactMatch && (
        <ComboboxItem
          disabled={!canCreate}
          onClick={() => onStartCreate(trimmedQuery)}
          buttonClassName="gap-1 py-1"
        >
          {/* px-2를 안 두는 이유는 후보 행과 동일 — Badge가 이미 자기 패딩을 갖고
              있어 행에 또 주면 이중으로 밀린다. 국문은 label_create_new_before가
              빈 문자열이라 이 값이 특히 중요하다(아니면 Badge 앞에 눈에 띄는
              여백이 생긴다). Badge를 문장 안에 끼우기 위해 앞/뒤 문구를 분리한다 —
              tolgee의 t()는 문자열 파라미터만 받아 컴포넌트를 끼워 넣을 수 없다
              (어순이 언어마다 달라 국문은 뒤쪽, 영문은 앞쪽에 문구가 붙는다). */}
          <Text
            as="span"
            size="sm"
            className={cn(!canCreate && "text-fg-quinary")}
          >
            {t("review.label_create_new_before")}
          </Text>
          <Badge variant="outline" shape="rounded" truncated>
            {trimmedQuery}
          </Badge>
          <Text
            as="span"
            size="sm"
            className={cn(!canCreate && "text-fg-quinary")}
          >
            {t("review.label_create_new_after")}
          </Text>
        </ComboboxItem>
      )}
    </>
  );
}
