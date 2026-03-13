import { useState } from "react";

import type { Message } from "@nema-io/shared";
import { Button, Card, CardContent } from "@nema-io/weave";
import { ChevronDown, ChevronRight } from "@nema-io/weave/icons";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { RelativeTime } from "./RelativeTime";

export function DraftCard({
  message,
  isLatest,
}: {
  message: Message;
  isLatest: boolean;
}) {
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
          <span>이전 드래프트</span>
          <RelativeTime dateTime={message.createdAt} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <Card className="border-brand/20 bg-brand-tint">
        {!isLatest && (
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-xs text-fg-tertiary">이전 드래프트</span>
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
          <MarkdownRenderer content={message.content} />
        </CardContent>
      </Card>
      <div className="mt-1">
        <RelativeTime dateTime={message.createdAt} />
      </div>
    </div>
  );
}
