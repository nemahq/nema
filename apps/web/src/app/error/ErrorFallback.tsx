import { useState } from "react";

import { Button } from "@nema-io/weave";
import { Check, Copy, RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useTranslation } from "@web/lib/tolgee";

const COPIED_FEEDBACK_MS = 2_000;

interface ErrorFallbackLabels {
  pageError: string;
  retry: string;
  refresh: string;
  copyError: string;
}

type ErrorFallbackSize = "page" | "section";

interface ErrorFallbackProps {
  detail?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  showBranding?: boolean;
  className?: string;
  labels?: ErrorFallbackLabels;
  size?: ErrorFallbackSize;
}

export function ErrorFallback({
  detail,
  onRetry,
  onRefresh,
  showBranding = true,
  className,
  labels,
  size = "section",
}: ErrorFallbackProps) {
  const [copied, setCopied] = useState(false);
  const isPage = size === "page";

  function handleCopy() {
    if (!detail) {
      return;
    }
    void navigator.clipboard.writeText(detail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    });
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-8 ${className ?? ""}`}
    >
      {showBranding && (
        <NemaMarkIcon
          width={isPage ? 40 : 32}
          height={isPage ? 49 : 39}
          className="mb-4 fill-teal-500 dark:fill-fg-primary"
        />
      )}
      <p className={`text-fg-tertiary ${isPage ? "text-base" : "text-sm"}`}>
        {labels?.pageError ?? <TranslatedPageError />}
      </p>
      {onRetry && (
        <Button
          variant="neutral"
          size={isPage ? "default" : "sm"}
          onClick={onRetry}
        >
          <RotateCcw className={isPage ? "size-4" : "size-3.5"} />
          {labels?.retry ?? <TranslatedRetry />}
        </Button>
      )}
      {onRefresh && (
        <Button
          variant="neutral"
          size={isPage ? "default" : "sm"}
          onClick={onRefresh}
        >
          <RefreshCw className={isPage ? "size-4" : "size-3.5"} />
          {labels?.refresh ?? <TranslatedRefresh />}
        </Button>
      )}
      {detail && (
        <button
          type="button"
          onClick={handleCopy}
          className={`-mt-1 flex items-center gap-1 text-fg-tertiary transition-colors hover:text-fg-secondary ${isPage ? "text-xs" : "text-[11px]"}`}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {labels?.copyError ?? <TranslatedCopyError />}
        </button>
      )}
    </div>
  );
}

function TranslatedPageError() {
  const { t } = useTranslation();
  return <>{t("error.page_error")}</>;
}

function TranslatedRetry() {
  const { t } = useTranslation();
  return <>{t("common.retry")}</>;
}

function TranslatedRefresh() {
  const { t } = useTranslation();
  return <>{t("error.refresh")}</>;
}

function TranslatedCopyError() {
  const { t } = useTranslation();
  return <>{t("error.copy_error")}</>;
}
