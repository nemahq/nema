import { type ReactNode, Suspense, useEffect } from "react";

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
import { useSourceSuspenseQuery } from "@web/features/source/hooks/useSourceQuery";
import { useTranslation } from "@web/lib/tolgee";
import { isNotFoundError } from "@web/lib/trpc";

import { SourceBodyView } from "./SourceBodyView";
import { SourceDeleteMenu } from "./SourceDeleteMenu";

interface SourceDetailPanelProps {
  sourceId: string;
  onClose: () => void;
  // 헤더 아래 상시 알림 자리 — 초안 화면이 "정리할 내용이 없어요" 경고를 꽂는다.
  // 이 컴포넌트 자신은 그 판단(결과 없음 여부)을 못 한다 — source.get 응답에
  // 다이제스트 개수가 안 실려서, 그 판단을 이미 하고 있는 소비처가 채운다.
  banner?: ReactNode;
}

interface SourceDetailCloseButtonProps {
  onClose: () => void;
}

function SourceDetailCloseButton({ onClose }: SourceDetailCloseButtonProps) {
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

function SourceDetailPanelContent({
  sourceId,
  onClose,
  banner,
}: SourceDetailPanelProps) {
  const { t } = useTranslation();
  const [source] = useSourceSuspenseQuery(sourceId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Text
            size="sm"
            weight="medium"
            color="primary"
            className="min-w-0 truncate"
          >
            {source.name}
          </Text>
          <RelativeTime dateTime={source.createdAt} />
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          {/* 삭제 성공 시 상세 패널을 같이 닫는다. */}
          <SourceDeleteMenu sourceId={sourceId} onDeleted={onClose} />
          <SourceDetailCloseButton onClose={onClose} />
        </div>
      </div>

      {banner && <div className="px-6 pt-3">{banner}</div>}

      {/* 제목·요약 추출은 아직 없는 기능이라 항상 빈 상태다 — 섹션 자체는 유지해
          자리를 예약해 두고, 어색해 보이지 않도록 안내 문구만 얹는다. */}
      <div className="px-6 pt-3 pb-1">
        <Text size="xs" color="tertiary">
          {t("source.summary_empty")}
        </Text>
      </div>

      <SourceBodyView body={source.body} />
    </div>
  );
}

interface SourceDetailPanelErrorProps extends ErrorFallbackProps {
  onClose: () => void;
}

function SourceDetailPanelError({
  onClose,
  ...fallbackProps
}: SourceDetailPanelErrorProps) {
  const missing = isNotFoundError(fallbackProps.error);

  useEffect(
    function closeOnMissingSource() {
      // 삭제된 원문을 가리키는 죽은 ?source=<id> 링크는 재시도해도 같은 NOT_FOUND를
      // 반복할 뿐이다 — legacy DraftDetailPanel의 clearMissingSource와 같은 이유로,
      // 에러를 보여주는 대신 패널을 스스로 닫는다.
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
        <SourceDetailCloseButton onClose={onClose} />
      </div>
      <SectionErrorFallback {...fallbackProps} />
    </div>
  );
}

// 원문 상세 — SidePanel 안에 얹는 공용 콘텐츠. 초안 화면과, 후속으로 붙는 다이제스트
// 목록 화면이 같은 컴포넌트로 원문 상세를 연다.
export function SourceDetailPanel({
  sourceId,
  onClose,
  banner,
}: SourceDetailPanelProps) {
  return (
    <ErrorBoundary
      boundaryName="source-detail"
      // NOT_FOUND는 삭제된 원문을 가리키는 죽은 링크에서 자연히 발생하는 예상된
      // 에러라 노이즈로 보고하지 않는다.
      shouldReport={(error) => !isNotFoundError(error)}
      fallbackRender={(fallbackProps) => (
        <SourceDetailPanelError {...fallbackProps} onClose={onClose} />
      )}
    >
      <Suspense fallback={<LoadingWatermark />}>
        <SourceDetailPanelContent
          sourceId={sourceId}
          onClose={onClose}
          banner={banner}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
