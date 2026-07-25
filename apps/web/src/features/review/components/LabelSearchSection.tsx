import type { ReactNode } from "react";

import { Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTranslation } from "@web/lib/tolgee";

interface LabelSearchSectionProps {
  boundaryName: string;
  children: ReactNode;
}

// 좌우 패딩을 두 겹으로 — 이 래퍼의 px-2는 리스트 자체를 팝오버 가장자리에서
// 띄우고(DropdownMenuContent의 p-1 스크롤 래퍼와 같은 역할), 행 각각의 px-2는 그
// 행(hover 하이라이트 박스) 안에서 배지·텍스트를 다시 한 번 안쪽으로 띄운다
// (DropdownMenuItem의 px-2와 같은 역할). 안내문은 행이 아니라 리스트 자체
// 지시문이라 래퍼 인셋 하나로 충분하다.
//
// Suspense는 여기 두지 않는다 — fallback은 목록을 실제로 불러오는 파일이 자기
// 옆에서 정해야 한다(eslint nema/require-suspense-boundary).
export function LabelSearchSection({
  boundaryName,
  children,
}: LabelSearchSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      <Text size="xs" color="tertiary">
        {t("review.label_search_placeholder")}
      </Text>
      <ErrorBoundary
        boundaryName={boundaryName}
        fallbackRender={() => (
          <ul>
            <Text as="li" size="sm" color="error" className="px-2 py-1">
              {t("review.label_search_error")}
            </Text>
          </ul>
        )}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
}
