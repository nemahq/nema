import { type ReactNode, useRef, useState } from "react";

import {
  Button,
  cn,
  TAB_ACTIVE_INDICATOR_CLASSNAME,
  TAB_DIMMED_ACTIVE_INDICATOR_CLASSNAME,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

import { NemaMarkIcon } from "./NemaMarkIcon";
import { TabbedPanelLayout } from "./TabbedPanelLayout";

type TabBase = {
  id: string;
  content: ReactNode;
  onClose?: () => void;
};

type TabbedPanelTab = TabBase &
  ({ labelKey: TranslationKey } | { label: string });

interface TabbedPanelProps {
  tabs: TabbedPanelTab[];
  activeTabId: string;
  onActiveTabChange: (tabId: string) => void;
  focused?: boolean;
  onTabDragStart?: (tabId: string, e: React.DragEvent) => void;
  onTabDragOver?: (e: React.DragEvent) => void;
  onTabDrop?: (e: React.DragEvent, dropTargetTabId: string) => void;
}

function resolveLabel(
  tab: TabbedPanelTab,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return "label" in tab ? tab.label : t(tab.labelKey);
}

function tabTextStyle(isActive: boolean, focused?: boolean): string {
  if (isActive) {
    return focused === false ? "text-fg-tertiary" : "text-fg-primary";
  }
  return focused === false
    ? "text-fg-tertiary/60 hover:text-fg-tertiary"
    : "text-fg-tertiary hover:text-fg-secondary";
}

type DropSide = "left" | "right" | null;

interface DraggableTabProps {
  tab: TabbedPanelTab;
  isActive: boolean;
  isFirst: boolean;
  focused?: boolean;
  draggable: boolean;
  label: string;
  onActiveTabChange: (tabId: string) => void;
  onTabDragStart?: (tabId: string, e: React.DragEvent) => void;
  onTabDrop?: (e: React.DragEvent, dropTargetTabId: string) => void;
  onTabClose: (e: React.MouseEvent, tab: TabbedPanelTab) => void;
  closeLabel: string;
}

function DraggableTab({
  tab,
  isActive,
  isFirst,
  focused,
  draggable,
  label,
  onActiveTabChange,
  onTabDragStart,
  onTabDrop,
  onTabClose,
  closeLabel,
}: DraggableTabProps) {
  const [dropSide, setDropSide] = useState<DropSide>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dragEnterCount = useRef(0);

  function handleDragOver(e: React.DragEvent) {
    if (!onTabDrop) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const relX = (e.clientX - rect.left) / rect.width;
    setDropSide(relX < 0.5 ? "left" : "right");
  }

  function handleDragEnter() {
    dragEnterCount.current += 1;
  }

  function handleDragLeave() {
    dragEnterCount.current -= 1;
    if (dragEnterCount.current <= 0) {
      dragEnterCount.current = 0;
      setDropSide(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.stopPropagation();
    dragEnterCount.current = 0;
    setDropSide(null);
    onTabDrop?.(e, tab.id);
  }

  function handleDragEnd() {
    dragEnterCount.current = 0;
    setDropSide(null);
  }

  return (
    <div
      ref={ref}
      key={tab.id}
      className={cn(
        "group -mb-px flex items-center",
        isActive
          ? cn(
              "border-r border-t-2 border-r-border bg-surface-card",
              focused === false
                ? TAB_DIMMED_ACTIVE_INDICATOR_CLASSNAME.top
                : TAB_ACTIVE_INDICATOR_CLASSNAME.top,
              !isFirst && "border-l border-l-border",
            )
          : "border border-transparent border-r-border/30",
        dropSide === "left" &&
          "border-l-2 border-l-brand dark:border-l-fg-primary",
        dropSide === "right" &&
          "border-r-2 border-r-brand dark:border-r-fg-primary",
      )}
      draggable={draggable}
      onDragStart={(e) => onTabDragStart?.(tab.id, e)}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {/* weave Tab 대신 raw — 활성 인디케이터가 이 버튼이 아니라 옆 닫기 버튼까지
          포함한 위 wrapper div에 걸려야 해서, 색 토큰(TAB_ACTIVE_INDICATOR_CLASSNAME)만
          가져다 쓰고 보더·텍스트 상태는 직접 관리한다. */}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`panel-${tab.id}`}
        onClick={() => onActiveTabChange(tab.id)}
        title={label}
        className={cn(
          "flex min-w-0 items-center gap-1 py-2 pl-3",
          tab.onClose ? "pr-1" : "pr-3",
          "text-sm font-medium",
          tabTextStyle(isActive, focused),
        )}
      >
        {/* 탭이 여러 개면 폭을 나눠 가지므로 라벨이 길면 잘라야 한다 — 원문·
            Digest·Reference 등 모든 탭 소비처가 공유하는 컴포넌트라 여기 한
            군데서 처리하면 소비처마다 따로 안 챙겨도 된다. title로 전체
            텍스트를 hover 시 확인 가능하게 유지. */}
        <span className="max-w-32 truncate">{label}</span>
      </button>
      {tab.onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => onTabClose(e, tab)}
          className="mr-1 text-fg-tertiary hover:text-fg-primary"
          aria-label={closeLabel}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}

export function TabbedPanel({
  tabs,
  activeTabId,
  onActiveTabChange,
  focused,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
}: TabbedPanelProps) {
  const { t } = useTranslation();

  const activeTabData = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const resolvedTab = activeTabData?.id ?? "";

  function handleTabClose(e: React.MouseEvent, tab: TabbedPanelTab) {
    e.stopPropagation();
    tab.onClose?.();
  }

  return (
    <TabbedPanelLayout
      header={
        tabs.length > 0
          ? tabs.map((tab, i) => (
              <DraggableTab
                key={tab.id}
                tab={tab}
                isActive={resolvedTab === tab.id}
                isFirst={i === 0}
                focused={focused}
                draggable={!!onTabDragStart}
                label={resolveLabel(tab, t)}
                onActiveTabChange={onActiveTabChange}
                onTabDragStart={onTabDragStart}
                onTabDrop={onTabDrop}
                onTabClose={handleTabClose}
                closeLabel={t("session.draft_tab_close", {
                  label: resolveLabel(tab, t),
                })}
              />
            ))
          : null
      }
      onHeaderDragOver={onTabDragOver}
    >
      {tabs.length > 0 ? (
        <div role="tabpanel" id={`panel-${resolvedTab}`}>
          {activeTabData?.content}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <NemaMarkIcon
            width={140}
            height={171}
            fill="currentColor"
            className="opacity-[0.06] dark:opacity-[0.08]"
          />
        </div>
      )}
    </TabbedPanelLayout>
  );
}
