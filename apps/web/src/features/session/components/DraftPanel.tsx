import { useState } from "react";

import type { SessionDraft } from "@nema-io/shared";
import { Button, Card, CardContent, cn, Kbd } from "@nema-io/weave";
import { PanelRight } from "@nema-io/weave/icons";

import { MarkdownRenderer } from "./MarkdownRenderer";

const PANEL_WIDTH = "w-[min(33vw,32rem)]";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex shrink-0">
      <div className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <Button
          variant="neutral"
          size="icon-xs"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-full shadow-sm dark:shadow-none dark:bg-surface-raised dark:border-border/50"
          aria-label={collapsed ? "드래프트 패널 열기" : "드래프트 패널 접기"}
        >
          <PanelRight
            strokeWidth={1.5}
            className={cn("size-3.5", collapsed && "rotate-180")}
          />
        </Button>
      </div>

      {!collapsed && (
        <aside
          className={cn(
            "flex flex-col border-l border-border bg-surface-base",
            PANEL_WIDTH,
          )}
        >
          <div className="flex-1 overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
            <Card>
              <CardContent className="pt-4">
                <MarkdownRenderer content={draft.body} />
              </CardContent>
            </Card>
          </div>

          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface-base px-4 py-3">
            <Button
              variant="neutral"
              size="sm"
              onClick={onCancel}
              disabled={isPending}
            >
              취소
              <Kbd className="ml-1.5">Esc</Kbd>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={isPending}
              className="dark:bg-fg-primary dark:text-surface-base dark:border-transparent dark:hover:opacity-80"
            >
              저장
              <Kbd className="ml-1.5 border-white/20 bg-white/10 text-inherit opacity-80">
                ⌘+S
              </Kbd>
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
