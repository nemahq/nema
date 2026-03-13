import { Suspense } from "react";

import { Button, Card, CardContent, Kbd } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";

function DraftTabContentInner() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const draft = useSessionDraft();
  const saveDraft = useSaveDraft();

  if (!draft) {
    return null;
  }

  return (
    <Card className="relative">
      <div className="absolute right-3 top-3">
        {/* TODO: ⌘+S 키보드 단축키 리스너 추가 */}
        <Button
          variant="primary"
          size="xs"
          onClick={() => saveDraft.mutate({ sessionId })}
          disabled={saveDraft.isPending}
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

export function DraftTabContent() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <DraftTabContentInner />
      </Suspense>
    </ErrorBoundary>
  );
}
