import { Suspense, useEffect } from "react";

import {
  Button,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useDigestSuspenseQuery } from "@web/features/digest/hooks/useDigestQuery";
import { useTranslation } from "@web/lib/tolgee";
import { isNotFoundError } from "@web/lib/trpc";

import { DigestBodyFields } from "./DigestBodyFields";
import { DigestDeleteMenu } from "./DigestDeleteMenu";
import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestDetailPanelProps {
  digestId: string;
  onClose: () => void;
}

interface DigestDetailCloseButtonProps {
  onClose: () => void;
}

function DigestDetailCloseButton({ onClose }: DigestDetailCloseButtonProps) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("common.close")}
          onClick={onClose}
          className="size-7 text-fg-tertiary"
        >
          <X className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("common.close")}</TooltipContent>
    </Tooltip>
  );
}

function DigestDetailPanelContent({
  digestId,
  onClose,
}: DigestDetailPanelProps) {
  const [digest] = useDigestSuspenseQuery(digestId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 items-center gap-2">
          <DigestTypeBadge type={digest.type} />
          <RelativeTime dateTime={digest.createdAt} />
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <DigestDeleteMenu digestId={digestId} onDeleted={onClose} />
          <DigestDetailCloseButton onClose={onClose} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pt-3 pb-8">
        {/* 목록에서는 한 줄로 잘리는 제목을 여기서는 통째로 보여준다 — 상세까지
            잘리면 이 패널을 열 이유가 없다. */}
        <Text as="h2" size="lg" weight="semibold" color="primary">
          {digest.title}
        </Text>
        <DigestBodyFields digest={digest} />
      </div>
    </div>
  );
}

interface DigestDetailPanelErrorProps extends ErrorFallbackProps {
  onClose: () => void;
}

function DigestDetailPanelError({
  onClose,
  ...fallbackProps
}: DigestDetailPanelErrorProps) {
  const missing = isNotFoundError(fallbackProps.error);

  useEffect(
    function closeOnMissingDigest() {
      // 걷어낸 다이제스트를 가리키는 죽은 ?digest=<id> 링크는 재시도해도 같은
      // NOT_FOUND를 반복할 뿐이다 — SourceDetailPanel과 같은 이유로 에러를
      // 보여주는 대신 패널을 스스로 닫는다.
      if (missing) {
        onClose();
      }
    },
    [missing, onClose],
  );

  if (missing) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-end px-6">
        <DigestDetailCloseButton onClose={onClose} />
      </div>
      <SectionErrorFallback {...fallbackProps} />
    </div>
  );
}

// 다이제스트 상세 — SidePanel 안에 얹는 읽기 전용 콘텐츠. 편집은 없고, 결과가
// 나쁘면 고치는 게 아니라 빼고 다시 돌린다.
export function DigestDetailPanel({
  digestId,
  onClose,
}: DigestDetailPanelProps) {
  return (
    <ErrorBoundary
      boundaryName="digest-detail"
      // NOT_FOUND는 걷어낸 다이제스트를 가리키는 죽은 링크에서 자연히 발생하는
      // 예상된 에러라 노이즈로 보고하지 않는다.
      shouldReport={(error) => !isNotFoundError(error)}
      fallbackRender={(fallbackProps) => (
        <DigestDetailPanelError {...fallbackProps} onClose={onClose} />
      )}
    >
      <Suspense fallback={<LoadingWatermark />}>
        <DigestDetailPanelContent digestId={digestId} onClose={onClose} />
      </Suspense>
    </ErrorBoundary>
  );
}
