import { useState } from "react";

import { Button, Text, Textarea } from "@nema-io/weave";
import { Check, Copy, RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import { buildErrorReport } from "@web/app/error/errorReport";
import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useTranslation } from "@web/lib/tolgee";

const COPIED_FEEDBACK_MS = 2_000;

export interface ErrorFallbackLabels {
  pageError: string;
  retry: string;
  refresh: string;
  copyError: string;
}

type ErrorFallbackSize = "page" | "section";

interface ErrorFallbackProps {
  error?: Error;
  eventId?: string;
  componentStack?: string;
  route?: string;
  timestamp?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  showBranding?: boolean;
  className?: string;
  labels?: Partial<ErrorFallbackLabels>;
  size?: ErrorFallbackSize;
}

// 배경색을 일부러 안 준다 — 어디 쓰이든 그 컨테이너의 평소 배경을 그대로 물려받아,
// 에러가 떠도 주변과 색이 안 튀게 한다(모든 위치를 하나의 색으로 통일하는 대신).
export function ErrorFallback({
  error,
  eventId,
  componentStack,
  route,
  timestamp,
  onRetry,
  onRefresh,
  showBranding = true,
  className,
  labels,
  size = "section",
}: ErrorFallbackProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailedText, setCopyFailedText] = useState<string | null>(null);
  const isPage = size === "page";

  function handleCopy() {
    if (!error) {
      return;
    }
    const report = buildErrorReport({
      error,
      eventId,
      componentStack,
      route: route ?? window.location.pathname,
      timestamp: timestamp ?? new Date().toISOString(),
    });
    // 클립보드가 유일한 배출구다 — writeText가 던지거나(비보안 컨텍스트) 거부되면
    // (권한 거부 등) 대신 텍스트를 펼쳐 수동 선택으로라도 복사할 수 있게 한다.
    if (!navigator.clipboard) {
      setCopyFailedText(report);
      return;
    }
    navigator.clipboard.writeText(report).then(
      () => {
        setCopyFailedText(null);
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      },
      () => {
        setCopyFailedText(report);
      },
    );
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
      {error && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          className="-mt-1"
        >
          {copied ? (
            <Check className="size-3 text-fg-tertiary" />
          ) : (
            <Copy className="size-3 text-fg-tertiary" />
          )}
          <Text as="span" size="xs" color="tertiary">
            {labels?.copyError ?? <TranslatedCopyError />}
          </Text>
        </Button>
      )}
      {copyFailedText && (
        <div className="flex w-full max-w-md flex-col gap-1">
          <p className="text-xs text-status-error">
            <TranslatedCopyFailed />
          </p>
          <Textarea
            readOnly
            value={copyFailedText}
            rows={6}
            className="font-mono text-xs"
            onClick={(e) => e.currentTarget.select()}
          />
        </div>
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

function TranslatedCopyFailed() {
  const { t } = useTranslation();
  return <>{t("error.copy_error_failed")}</>;
}
