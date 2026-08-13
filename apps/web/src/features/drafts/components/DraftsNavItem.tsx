import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { cn, Text } from "@nema-io/weave";
import { FileText, TriangleAlert } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { useSidebar } from "@web/components/layout/Sidebar";
import { useSourceDraftListQuery } from "@web/features/drafts/hooks/useSourceDraftListQuery";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";
// --duration-slow와 맞춰, 애니메이션이 끝난 뒤에 다음 단계로 넘어가게 한다.
const TRANSITION_ANIMATION_MS = 300;

type RenderState = "hidden" | "entering" | "visible" | "exiting";

// 대기 중인 초안이 있을 때만 노출 — 다 처리되면 사라진다(Linear의 Drafts와 같은 동작).
export function DraftsNavItem() {
  const { t } = useTranslation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { collapsed } = useSidebar();
  const draftsQuery = useSourceDraftListQuery();
  const [renderState, setRenderState] = useState<RenderState>("hidden");
  // 직전 가시성 — 이펙트 안에서만 갱신(렌더 중 ref 접근 금지 규칙 회피).
  const wasVisibleRef = useRef(false);
  // 쿼리가 처음 로딩을 끝낸 적 있는지. 이펙트 실행 횟수로 판단하면 안 된다 —
  // 새로고침 시 응답이 늦게 와서 기존 초안이 뒤늦게 드러나는 걸 "방금 생김"으로
  // 오인해 entering이 잘못 재생되는 문제가 있었다.
  const hasLoadedOnceRef = useRef(false);

  const drafts = draftsQuery.data ?? [];
  const draftCount = drafts.length;
  // pending은 이번 세대에서 "정리 실패"만을 뜻한다 — 동기 처리라 처리중이라는
  // 중간 상태가 없다.
  const hasFailed = drafts.some((draft) => draft.status === "pending");
  // 조회 실패로 개수를 모르는 상태를 "0개"로 오인해 항목을 숨기지 않는다 — 실제 초안이
  // 있는데도 조용히 진입점이 사라지는 것보다는, 눌러서 /drafts의 에러 상태를 보는 편이 낫다.
  const hasData = draftCount > 0 || draftsQuery.isError;
  // /drafts를 보고 있는 동안은 0개가 되어도 계속 보여준다 — 지금 보고 있는 화면의
  // 진입점이 눈앞에서 먼저 사라지면 어색하다. 다른 곳으로 이동한 뒤에야 접힌다.
  const isVisible = hasData || pathname === "/drafts";

  useEffect(
    function syncVisibility() {
      const wasVisible = wasVisibleRef.current;
      const hadLoadedBefore = hasLoadedOnceRef.current;
      if (!draftsQuery.isLoading) {
        hasLoadedOnceRef.current = true;
      }

      // setState를 이펙트에서 동기 호출하면 set-state-in-effect 린트에 걸려 setTimeout으로 미룬다.
      if (isVisible) {
        wasVisibleRef.current = true;
        if (!hadLoadedBefore || wasVisible) {
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
        // 처음부터 0개였다면(새로고침 등) 접을 것도 없이 바로 숨긴다.
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
    [isVisible, draftsQuery.isLoading],
  );

  if (renderState === "hidden") {
    return null;
  }

  const statusIndicator = hasFailed ? (
    <TriangleAlert
      className={cn(
        "size-3.5 shrink-0 text-status-error",
        // 아이콘 도형이 뷰박스 안에서 오른쪽으로 치우쳐 있어 펼침 모드에서 카운트와
        // 축이 안 맞는다 — 접힘 모드(코너 배지)는 이 보정이 필요 없다.
        !collapsed && "-translate-x-1",
      )}
    />
  ) : null;

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
          // 접힘 모드는 정확한 개수를 안 보여주니 툴팁에 붙여 hover로 확인하게 한다.
          tooltipLabel={
            draftCount > 0
              ? `${t("workspace.drafts")} · ${draftCount}`
              : t("workspace.drafts")
          }
          // exiting 중엔 이미 0개라 카운트·상태를 보여주면 오해를 준다.
          labelSuffix={renderState !== "exiting" ? statusIndicator : null}
          to="/drafts"
          rightContentAlwaysVisible
          rightContent={
            renderState !== "exiting" && draftCount > 0 ? (
              <Text
                as="span"
                size="xs"
                color="tertiary"
                className="absolute right-3.5 flex size-5 items-center justify-center"
              >
                {draftCount}
              </Text>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
