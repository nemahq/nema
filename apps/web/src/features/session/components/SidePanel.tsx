import type { ComponentType, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

import { cn } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 280;
const MAX_WIDTH_VW = 50;

export interface SidePanelTab {
  id: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
  onClose?: () => void;
}

export function SidePanel({ tabs }: { tabs: SidePanelTab[] }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  function handleTabClick(tabId: string) {
    setActiveTab(tabId);
  }

  function handleTabClose(e: React.MouseEvent, tab: SidePanelTab) {
    e.stopPropagation();
    tab.onClose?.();
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

  const activeTabData = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

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

      {tabs.length > 0 ? (
        <>
          <div
            role="tablist"
            className="flex items-center border-b border-border"
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "group flex items-center border-b-2",
                  activeTab === tab.id ? "border-brand" : "border-transparent",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 py-2 pl-3 pr-1",
                    "text-sm font-medium transition-colors hover:bg-surface-raised",
                    activeTab === tab.id
                      ? "text-fg-primary"
                      : "text-fg-tertiary hover:text-fg-secondary",
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {t(tab.labelKey)}
                </button>
                {tab.onClose && (
                  <button
                    type="button"
                    onClick={(e) => handleTabClose(e, tab)}
                    className="mr-1 rounded p-0.5 text-fg-tertiary transition-colors hover:bg-surface-raised-hover hover:text-fg-primary"
                    aria-label={t("session.draft_tab_close", {
                      label: t(tab.labelKey),
                    })}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`panel-${activeTabData.id}`}
            className="flex-1 overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
          >
            {activeTabData.content}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-fg-quaternary">
          <span className="text-lg font-semibold">Logo</span>
        </div>
      )}
    </aside>
  );
}
