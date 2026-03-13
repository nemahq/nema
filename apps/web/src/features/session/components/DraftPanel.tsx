import { useCallback, useRef, useState } from "react";

import type { SessionDraft } from "@nema-io/shared";
import { Button, Card, CardContent, cn, Kbd } from "@nema-io/weave";
import { FileText, X } from "@nema-io/weave/icons";

import { MarkdownRenderer } from "./MarkdownRenderer";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 280;
const MAX_WIDTH_VW = 50;

const TABS = [{ id: "draft", label: "드래프트", icon: FileText }] as const;

type TabId = (typeof TABS)[number]["id"];

export function DraftPanel({
  draft,
  onSave,
  onCancel,
  isPending,
}: {
  draft: SessionDraft;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("draft");
  const [openTabs, setOpenTabs] = useState<Set<TabId>>(
    () => new Set<TabId>(["draft"]),
  );
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  const visibleTabs = TABS.filter((tab) => openTabs.has(tab.id));

  function handleTabClick(tabId: TabId) {
    if (collapsed) {
      setCollapsed(false);
      setActiveTab(tabId);
    } else if (activeTab === tabId) {
      setCollapsed(true);
    } else {
      setActiveTab(tabId);
    }
  }

  function handleTabClose(e: React.MouseEvent, tabId: TabId) {
    e.stopPropagation();

    if (tabId === "draft") {
      onCancel();
    }

    const next = new Set(openTabs);
    next.delete(tabId);
    setOpenTabs(next);

    if (activeTab === tabId && next.size > 0) {
      const remaining = TABS.filter((t) => next.has(t.id));
      setActiveTab(remaining[0].id);
    }
  }

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const maxWidth = window.innerWidth * (MAX_WIDTH_VW / 100);

      function onMouseMove(ev: MouseEvent) {
        if (!dragging.current) {
          return;
        }
        const delta = startX - ev.clientX;
        const next = Math.min(
          maxWidth,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        setWidth(next);
      }

      function onMouseUp() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width],
  );

  if (visibleTabs.length === 0) {
    return null;
  }

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col border-l border-border bg-surface-base">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "flex flex-col items-center gap-2 px-2.5 py-3",
              "cursor-pointer transition-colors hover:bg-surface-raised",
              activeTab === tab.id
                ? "text-fg-secondary"
                : "text-fg-tertiary hover:text-fg-secondary",
            )}
            aria-label={`${tab.label} 패널 열기`}
          >
            <tab.icon className="size-4" />
            <span className="text-[11px] font-medium [writing-mode:vertical-rl]">
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col bg-surface-base"
      style={{ width }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize border-l border-border hover:border-brand active:border-brand"
      />

      <div className="flex items-center border-b border-border">
        {visibleTabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleTabClick(tab.id);
              }
            }}
            className={cn(
              "group flex items-center gap-1.5 border-b-2 px-3 py-2",
              "cursor-pointer text-sm font-medium",
              "transition-colors hover:bg-surface-raised",
              activeTab === tab.id
                ? "border-brand text-fg-primary"
                : "border-transparent text-fg-tertiary hover:text-fg-secondary",
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
            <button
              type="button"
              onClick={(e) => handleTabClose(e, tab.id)}
              className="ml-1 rounded p-0.5 text-fg-tertiary transition-colors hover:bg-surface-raised-hover hover:text-fg-primary"
              aria-label={`${tab.label} 탭 닫기`}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>

      {activeTab === "draft" && openTabs.has("draft") && (
        <div className="flex-1 overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
          <Card className="relative">
            <div className="absolute right-3 top-3">
              <Button
                variant="primary"
                size="xs"
                onClick={onSave}
                disabled={isPending}
                className="gap-1 dark:bg-fg-primary dark:text-surface-base dark:border-transparent dark:hover:opacity-80"
              >
                저장
                <Kbd className="border-white/20 bg-white/10 text-inherit opacity-80">
                  ⌘+S
                </Kbd>
              </Button>
            </div>
            <CardContent className="pt-4">
              <MarkdownRenderer content={draft.body} />
            </CardContent>
          </Card>
        </div>
      )}
    </aside>
  );
}
