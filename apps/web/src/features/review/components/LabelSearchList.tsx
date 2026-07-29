import type { ReactNode } from "react";

import type { TagColor } from "@nema-io/shared";
import { Badge, ComboboxItem, TAG_COLOR_CLASSNAME, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface LabelSearchListProps {
  trimmedQuery: string;
  hasCandidates: boolean;
  canCreate: boolean;
  // Tag 전용 — "만들기" 미리보기 Badge에 색을 입힌다. Topic은 색 개념이 없어
  // 안 넘긴다(LabelSearchRow의 color prop과 같은 이유).
  createPreviewColor?: TagColor;
  onStartCreate: (name: string) => void;
  children: ReactNode;
}

// Notion처럼 팝오버 전체가 하나의 편집 표면이라, 별도 팝오버로 검색 결과를 또
// 띄우지 않고 같은 화면에 바로 이어 붙인다.
export function LabelSearchList({
  trimmedQuery,
  hasCandidates,
  canCreate,
  createPreviewColor,
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
      {/* canCreate가 이미 !hasExactMatch를 포함한다 — 레지스트리 기존 태그와
          겹칠 때(hasExactMatch)뿐 아니라, 이 Digest에 이미 붙은 draft(신규)
          태그와 이름이 겹칠 때도 disabled로 반쯤 보여주는 대신 아예 안
          뜨게 해서 두 "겹침" 케이스를 같은 방식으로 다룬다. */}
      {trimmedQuery !== "" && canCreate && (
        <ComboboxItem
          onClick={() => onStartCreate(trimmedQuery)}
          buttonClassName="gap-1"
        >
          {/* Badge를 문장 안에 끼우기 위해 앞/뒤 문구를 분리한다 —
              tolgee의 t()는 문자열 파라미터만 받아 컴포넌트를 끼워 넣을 수 없다
              (어순이 언어마다 달라 국문은 뒤쪽, 영문은 앞쪽에 문구가 붙는다). */}
          <Text as="span" size="sm">
            {t("review.label_create_new_before")}
          </Text>
          <Badge
            variant={createPreviewColor ? undefined : "outline"}
            shape="rounded"
            truncated
            className={
              createPreviewColor
                ? TAG_COLOR_CLASSNAME[createPreviewColor]
                : undefined
            }
          >
            {trimmedQuery}
          </Badge>
          <Text as="span" size="sm">
            {t("review.label_create_new_after")}
          </Text>
        </ComboboxItem>
      )}
    </>
  );
}
