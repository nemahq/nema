import { useEffect, useState } from "react";

import { cn } from "@nema-io/weave";
import { Circle, FileText, TriangleAlert } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { draftStatus, isDraftItem } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";

// Linear Drafts처럼 대기 중인 초안이 있을 때만 노출 — 다 처리되면 항목 자체가 사라진다
// (intake-flow.md "LNB 초안 버튼 조건부 노출").
export function DraftsNavItem() {
  const { t } = useTranslation();
  const pendingQuery = usePendingSourceListQuery();
  // 진짜 0개였던 순간을 확인한 적이 있어야만 그 다음 등장을 "방금 생김"으로 본다 —
  // 안 그러면 새로고침 때 이미 있던 초안도 매번 펼쳐지는 걸로 오인된다.
  const [hasSeenEmpty, setHasSeenEmpty] = useState(false);

  const draftItems = (pendingQuery.data?.items ?? []).filter(isDraftItem);
  const draftCount = draftItems.length;
  // 우선순위: 실패 > 처리중 > (대기중만 있으면 표시 없음). 섞여 있어도 가장 급한
  // 상태 하나만 보여준다 — 구성 비율까지 숫자로 쪼개면 오히려 더 복잡해 보인다.
  const hasFailed = draftItems.some((item) => draftStatus(item) === "failed");
  const hasProcessing = draftItems.some(
    (item) => draftStatus(item) === "processing",
  );

  useEffect(
    function trackConfirmedEmpty() {
      if (!pendingQuery.isLoading && draftCount === 0) {
        // setState를 이펙트 본문에서 동기 호출하면 react-compiler 린트에 걸려
        // (cascading render 경고) setTimeout 콜백 안에서 부른다.
        const timer = setTimeout(() => setHasSeenEmpty(true), 0);
        return () => clearTimeout(timer);
      }
    },
    [pendingQuery.isLoading, draftCount],
  );

  // 조회 실패로 개수를 모르는 상태를 "0개"로 오인해 항목을 숨기지 않는다 — 실제 초안이
  // 있는데도 조용히 진입점이 사라지는 것보다는, 눌러서 /drafts의 에러 상태를 보는 편이 낫다.
  if (draftCount === 0 && !pendingQuery.isError) {
    return null;
  }

  let statusIndicator = null;
  if (hasFailed) {
    statusIndicator = (
      <TriangleAlert className="size-3.5 shrink-0 text-status-error" />
    );
  } else if (hasProcessing) {
    statusIndicator = (
      <Circle className="size-1.5 shrink-0 animate-pulse fill-current text-fg-tertiary" />
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "grid",
        hasSeenEmpty &&
          "[animation:expand-down_var(--duration-slow)_var(--ease-out)]",
      )}
    >
      <div className="overflow-hidden">
        <NavItem
          icon={<FileText strokeWidth={1.5} className={NAV_ICON_CLASS} />}
          label={t("workspace.drafts")}
          labelSuffix={statusIndicator}
          to="/drafts"
          rightContent={
            // "+"(LnbHoverIcon)가 size-5 박스 안에서 아이콘을 중앙정렬해 실제
            // 보이는 획이 right-3.5보다 안쪽에서 끝난다 — 숫자도 같은 크기 박스로
            // 감싸야 시각적 우측 끝이 맞는다(박스 없이 바로 두면 더 바깥으로 붙어 보임).
            <span className="absolute right-3.5 flex size-5 items-center justify-center text-xs text-fg-tertiary">
              {draftCount}
            </span>
          }
        />
      </div>
    </div>
  );
}
