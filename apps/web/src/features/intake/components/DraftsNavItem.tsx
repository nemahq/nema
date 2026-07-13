import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { cn } from "@nema-io/weave";
import { Circle, FileText, TriangleAlert } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { useSidebar } from "@web/components/layout/Sidebar";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { draftStatus, isDraftItem } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";
// weave --duration-slow(300ms)와 값을 맞춘다 — 애니메이션이 다 재생된 뒤에
// 다음 단계(visible/hidden)로 넘어가야 뚝 끊기지 않는다.
const TRANSITION_ANIMATION_MS = 300;

type RenderState = "hidden" | "entering" | "visible" | "exiting";

// Linear Drafts처럼 대기 중인 초안이 있을 때만 노출 — 다 처리되면 항목 자체가 사라진다
// (intake-flow.md "LNB 초안 버튼 조건부 노출").
export function DraftsNavItem() {
  const { t } = useTranslation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { collapsed } = useSidebar();
  const pendingQuery = usePendingSourceListQuery();
  const [renderState, setRenderState] = useState<RenderState>("hidden");
  // isVisible이 false로 바뀌기 직전에 true였는지(=접힘 애니메이션을 거쳐야 하는지)
  // 판단하는 용도 — 이펙트 안에서만 읽고 쓰므로 렌더 중 ref 접근 금지 규칙에 안 걸린다.
  const wasVisibleRef = useRef(false);
  // pendingQuery가 실제로 한 번이라도 로딩을 끝낸 적이 있는지 — "이펙트가 실행된
  // 적 있는지"로 판단하면 안 된다. /drafts 체류처럼 pathname은 마운트 즉시(네트워크
  // 없이) 알 수 있지만, 카운트는 서버 응답이 와야 알 수 있어서, 로딩 중에 이미
  // 이펙트가 한 번 돌고 난 뒤 응답이 도착하는 게 "두 번째 전환"으로 잘못 잡혀
  // entering이 재생되는 문제가 있었다.
  const hasLoadedOnceRef = useRef(false);

  const draftItems = (pendingQuery.data?.items ?? []).filter(isDraftItem);
  const draftCount = draftItems.length;
  // 우선순위: 실패 > 처리중 > (cancelled/empty만 있으면 표시 없음). 섞여 있어도
  // 가장 급한 상태 하나만 보여준다 — 구성 비율까지 숫자로 쪼개면 오히려 더 복잡해 보인다.
  const hasFailed = draftItems.some((item) => draftStatus(item) === "failed");
  const hasProcessing = draftItems.some(
    (item) => draftStatus(item) === "processing",
  );
  // 조회 실패로 개수를 모르는 상태를 "0개"로 오인해 항목을 숨기지 않는다 — 실제 초안이
  // 있는데도 조용히 진입점이 사라지는 것보다는, 눌러서 /drafts의 에러 상태를 보는 편이 낫다.
  const hasData = draftCount > 0 || pendingQuery.isError;
  // /drafts를 보고 있는 동안은 0개가 되어도 계속 보여준다 — 지금 보고 있는 화면의
  // 진입점이 눈앞에서 먼저 사라지면 어색하다. 다른 곳으로 이동한 뒤에야 접힌다.
  const isVisible = hasData || pathname === "/drafts";

  useEffect(
    function syncVisibility() {
      const wasVisible = wasVisibleRef.current;
      const hadLoadedBefore = hasLoadedOnceRef.current;
      if (!pendingQuery.isLoading) {
        hasLoadedOnceRef.current = true;
      }

      // setState를 이펙트 본문에서 동기 호출하면 react-hooks/set-state-in-effect
      // 린트에 걸려(cascading render 경고) setTimeout 콜백 안에서 부른다.
      if (isVisible) {
        wasVisibleRef.current = true;
        if (!hadLoadedBefore || wasVisible) {
          // 첫 로딩이 아직 안 끝났었거나(=지금이 그 첫 로딩 결과) 이미 보이던 중이면
          // (카운트만 바뀐 경우 등) entering을 건너뛰고 바로 visible로 둔다.
          const timer = setTimeout(() => setRenderState("visible"), 0);
          return () => clearTimeout(timer);
        }
        const enterTimer = setTimeout(() => setRenderState("entering"), 0);
        const settleTimer = setTimeout(
          () => setRenderState("visible"),
          TRANSITION_ANIMATION_MS,
        );
        return () => {
          clearTimeout(enterTimer);
          clearTimeout(settleTimer);
        };
      }

      if (!wasVisible) {
        // 직전에 보이고 있었을 때만 접히는 애니메이션을 거친다 — 처음부터
        // 0개였던 경우(새로고침 등)는 접을 것도 없이 바로 숨긴다.
        const timer = setTimeout(() => setRenderState("hidden"), 0);
        return () => clearTimeout(timer);
      }
      wasVisibleRef.current = false;
      const exitTimer = setTimeout(() => setRenderState("exiting"), 0);
      const hideTimer = setTimeout(
        () => setRenderState("hidden"),
        TRANSITION_ANIMATION_MS,
      );
      return () => {
        clearTimeout(exitTimer);
        clearTimeout(hideTimer);
      };
    },
    [isVisible, pendingQuery.isLoading],
  );

  if (renderState === "hidden") {
    return null;
  }

  let statusIndicator = null;
  if (hasFailed) {
    statusIndicator = (
      <TriangleAlert
        className={cn(
          "size-3.5 shrink-0 text-status-error",
          // 아이콘 자체의 도형이 뷰박스 안에서 살짝 오른쪽으로 치우쳐 있어서, 펼침
          // 모드(라벨 옆 인라인)에서 펄스 점과 나란히 두면 중심축이 안 맞아 보인다
          // — 접힘 모드(아이콘 위 배지)는 이 보정이 필요 없어 collapsed일 땐 안 준다.
          !collapsed && "-translate-x-1",
        )}
      />
    );
  } else if (hasProcessing) {
    statusIndicator = (
      <Circle className="size-1.5 shrink-0 animate-pulse fill-current text-status-info" />
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "grid",
        renderState === "entering" &&
          "[animation:expand-down_var(--duration-slow)_var(--ease-out)]",
        renderState === "exiting" &&
          "[animation:collapse-up_var(--duration-slow)_var(--ease-out)_forwards]",
      )}
    >
      <div className="overflow-hidden">
        <NavItem
          icon={<FileText strokeWidth={1.5} className={NAV_ICON_CLASS} />}
          label={t("workspace.drafts")}
          // 접힘 모드는 아이콘 위 배지로만 상태를 보여주고 정확한 개수는 안 보이니,
          // 툴팁 텍스트에 개수를 붙여 hover로 확인할 수 있게 한다.
          tooltipLabel={
            draftCount > 0
              ? `${t("workspace.drafts")} · ${draftCount}`
              : t("workspace.drafts")
          }
          // exiting 중엔 이미 0개라 실제 카운트·상태를 보여주면 오해를 준다(예:
          // "Drafts 0") — 사라지는 동안은 라벨만 남기고 조용히 접히게 둔다.
          labelSuffix={renderState !== "exiting" ? statusIndicator : null}
          to="/drafts"
          rightContent={
            // 0개(에러 포함)일 땐 숫자를 안 보여준다 — /drafts에 남아있느라 항목
            // 자체는 떠 있어도, "0"이라는 무의미한 카운트까지 노출할 필요는 없다.
            renderState !== "exiting" && draftCount > 0 ? (
              // "+"(LnbHoverIcon)가 size-5 박스 안에서 아이콘을 중앙정렬해 실제
              // 보이는 획이 right-3.5보다 안쪽에서 끝난다 — 숫자도 같은 크기 박스로
              // 감싸야 시각적 우측 끝이 맞는다(박스 없이 바로 두면 더 바깥으로 붙어 보임).
              <span className="absolute right-3.5 flex size-5 items-center justify-center text-xs text-fg-tertiary">
                {draftCount}
              </span>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
