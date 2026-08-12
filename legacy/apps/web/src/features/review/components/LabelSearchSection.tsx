import type { ReactNode } from "react";

import { Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTranslation } from "@web/lib/tolgee";

interface LabelSearchSectionProps {
  boundaryName: string;
  children: ReactNode;
}

// 좌우 패딩 대부분은 이 래퍼가 아니라 각 행(ComboboxItem 자신의 px-2)이 갖는다 —
// 래퍼가 같은 px-2를 또 두면 리스트 쪽만 이중으로 크게 밀린다. 다만 리스트 전체를
// 팝오버 가장자리에서 아주 살짝 띄우기 위해 px-1(행 자체 px-2보다 작은 값)만
// 별도로 둔다. 안내문은 행이 아니라 리스트 자체 지시문이라(ComboboxItem을 안
// 거침) 여기서 자체 px-2가 필요하다.
//
// Suspense는 여기 두지 않는다 — fallback은 목록을 실제로 불러오는 파일이 자기
// 옆에서 정해야 한다(eslint nema/require-suspense-boundary).
export function LabelSearchSection({
  boundaryName,
  children,
}: LabelSearchSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 pb-2">
      <Text size="xs" color="tertiary" className="px-2">
        {t("review.label_search_placeholder")}
      </Text>
      <ErrorBoundary
        boundaryName={boundaryName}
        fallbackRender={() => (
          <ul className="px-1">
            <Text as="li" size="sm" color="error" className="px-2 py-1">
              {t("review.label_search_error")}
            </Text>
          </ul>
        )}
      >
        <div className="px-1">{children}</div>
      </ErrorBoundary>
    </div>
  );
}
