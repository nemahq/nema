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
import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useDigestSuspenseQuery } from "@web/features/digest/hooks/useDigestQuery";
import { useTranslation } from "@web/lib/tolgee";
import { isNotFoundError } from "@web/lib/trpc";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestDeleteAction } from "./DigestDeleteAction";
import { DigestDetailPanelSkeleton } from "./DigestDetailPanelSkeleton";
import { DigestReadonlyBodyFields } from "./DigestReadonlyBodyFields";
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

interface DigestDetailPanelContentProps {
  digestId: string;
}

function DigestDetailPanelContent({ digestId }: DigestDetailPanelContentProps) {
  const [digest] = useDigestSuspenseQuery(digestId);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pt-3 pb-8">
      <CandidateCardFrame
        wash={
          <>
            <div className="flex min-w-0 items-center gap-2">
              <DigestTypeBadge type={digest.type} />
              {/* 목록에서는 한 줄로 잘리는 제목을 여기서는 통째로 보여준다 —
                  상세까지 잘리면 이 패널을 열 이유가 없다. truncate 대신
                  min-w-0만 둬서 넘치면 줄바꿈되게 한다. */}
              <Text as="span" size="xl" weight="semibold" className="min-w-0">
                {digest.title}
              </Text>
            </div>
            <RelativeTime dateTime={digest.createdAt} />
          </>
        }
      >
        <DigestReadonlyBodyFields digest={digest} />
      </CandidateCardFrame>
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

  return <SectionErrorFallback {...fallbackProps} />;
}

// 다이제스트 상세 — SidePanel 안에 얹는 읽기 전용 콘텐츠. 편집은 없고, 결과가
// 나쁘면 고치는 게 아니라 빼고 다시 돌린다. 사이드뷰 헤더는 액션 전용으로 비워
// 두고, 유형·제목·시각은 CandidateCardFrame의 워시 구역으로 내린다(원문 상세
// SourceDetailPanel과 같은 이유로 헤더는 페칭과 별개로 즉시 눌러진다).
export function DigestDetailPanel({
  digestId,
  onClose,
}: DigestDetailPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-end gap-3 px-6">
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <DigestDeleteAction digestId={digestId} onDeleted={onClose} />
          <DigestDetailCloseButton onClose={onClose} />
        </div>
      </div>

      <ErrorBoundary
        boundaryName="digest-detail"
        // NOT_FOUND는 걷어낸 다이제스트를 가리키는 죽은 링크에서 자연히 발생하는
        // 예상된 에러라 노이즈로 보고하지 않는다.
        shouldReport={(error) => !isNotFoundError(error)}
        fallbackRender={(fallbackProps) => (
          <DigestDetailPanelError {...fallbackProps} onClose={onClose} />
        )}
      >
        <Suspense fallback={<DigestDetailPanelSkeleton />}>
          <DigestDetailPanelContent digestId={digestId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
