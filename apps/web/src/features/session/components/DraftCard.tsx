import { useState } from "react";

import { Button, Card, CardContent } from "@nema-io/weave";
import { ChevronDown, ChevronRight } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { RelativeTime } from "./RelativeTime";

export function DraftCard({
  content,
  createdAt,
  isLatest,
}: {
  content: string;
  createdAt: string;
  isLatest: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isLatest);

  if (!expanded) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-secondary transition-colors"
        >
          <ChevronRight className="size-3.5" />
          <span>{t("session.draft_previous")}</span>
          <RelativeTime dateTime={createdAt} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <Card className="border-brand/20 bg-brand-tint">
        {!isLatest && (
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-xs text-fg-tertiary">
              {t("session.draft_previous")}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
        )}
        <CardContent className={isLatest ? "pt-4" : "pt-2"}>
          <MarkdownRenderer content={content} />
        </CardContent>
      </Card>
      <div className="mt-1">
        <RelativeTime dateTime={createdAt} />
      </div>
    </div>
  );
}
