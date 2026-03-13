import type { SessionDraft } from "@nema-io/shared";
import { Button, Card, CardContent, Kbd } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";

export function DraftTabContent({
  draft,
  onSave,
  isPending,
}: {
  draft: SessionDraft;
  onSave: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Card className="relative">
      <div className="absolute right-3 top-3">
        {/* TODO: ⌘+S 키보드 단축키 리스너 추가 */}
        <Button
          variant="primary"
          size="xs"
          onClick={onSave}
          disabled={isPending}
          className="gap-1 dark:bg-fg-primary dark:text-surface-base dark:border-transparent dark:hover:opacity-80"
        >
          {t("session.draft_save")}
          <Kbd className="border-white/20 bg-white/10 text-inherit opacity-80">
            ⌘+S
          </Kbd>
        </Button>
      </div>
      <CardContent className="pt-4">
        <MarkdownRenderer content={draft.body} />
      </CardContent>
    </Card>
  );
}
