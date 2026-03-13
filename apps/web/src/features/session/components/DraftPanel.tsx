import type { SessionDraft } from "@nema-io/shared";
import { Button, Card, CardContent } from "@nema-io/weave";
import { Save, X } from "@nema-io/weave/icons";

import { MarkdownRenderer } from "./MarkdownRenderer";

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
  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface-base overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg-primary">드래프트</h2>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onCancel}
              disabled={isPending}
              aria-label="드래프트 취소"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <MarkdownRenderer content={draft.body} />
          </CardContent>
        </Card>

        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isPending}
          className="w-full"
        >
          <Save className="size-4" />
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </div>
    </aside>
  );
}
