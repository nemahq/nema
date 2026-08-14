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
import {
  useSourceQuery,
  useSourceSuspenseQuery,
} from "@web/features/source/hooks/useSourceQuery";
import { useTranslation } from "@web/lib/tolgee";
import { isNotFoundError } from "@web/lib/trpc";

import { SourceBodyView } from "./SourceBodyView";
import { SourceDeleteAction } from "./SourceDeleteAction";
import { SourceDetailPanelSkeleton } from "./SourceDetailPanelSkeleton";

interface SourceDetailPanelProps {
  sourcePublicId: string;
  // 목록 클릭으로 열었다면 호출자가 이미 내부 id를 들고 있다(list 응답이 sourceId·
  // publicId를 함께 싣는다) — 그 값을 넘기면 삭제가 조회 응답을 기다리지 않고 바로
  // 가능해진다. 새로고침·딥링크로 들어와 호출자도 모르면 undefined — 이땐 아래
  // useSourceQuery(non-suspense)가 응답을 받아오는 대로 채운다.
  knownSourceId?: string;
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

interface SourceDetailBodyProps {
  sourcePublicId: string;
  banner?: ReactNode;
}

// 헤더(삭제·닫기)는 sourcePublicId만 있으면 그릴 수 있는 요소라 source.get
// 페칭과 묶을 이유가 없다 — Suspense/ErrorBoundary는 실제로 페칭에 걸리는 이
// 부분에만 두고, 헤더는 항상 즉시 눌러진다(로딩·에러 중에도 닫기는 가능해야
// 한다. 삭제는 내부 id가 필요해 SourceDeleteAction이 별도로 기다린다).
function SourceDetailBody({ sourcePublicId, banner }: SourceDetailBodyProps) {
  const [source] = useSourceSuspenseQuery(sourcePublicId);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pt-3 pb-8">
      {banner}

      <Text as="h2" size="xl" weight="bold">
        {source.name}
      </Text>

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

  return <SectionErrorFallback {...fallbackProps} />;
}

// 원문 상세 — SidePanel 안에 얹는 공용 콘텐츠. 초안 화면과, 후속으로 붙는 다이제스트
// 목록 화면이 같은 컴포넌트로 원문 상세를 연다.
export function SourceDetailPanel({
  sourcePublicId,
  knownSourceId,
  onClose,
  banner,
}: SourceDetailPanelProps) {
  // 클릭 진입이면 knownSourceId가 이미 있다 — 그대로 쓴다. 새로고침·딥링크로
  // 들어와 없으면 source.get 응답(캐시 공유, 아래 SourceDetailBody의
  // useSourceSuspenseQuery와 같은 키)이 올 때까지 undefined다.
  const { data: fetchedSource } = useSourceQuery(sourcePublicId);
  const sourceId = knownSourceId ?? fetchedSource?.sourceId;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-end gap-3 px-6">
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          {/* 삭제 성공 시 상세 패널을 같이 닫는다. */}
          <SourceDeleteAction sourceId={sourceId} onDeleted={onClose} />
          <SourceDetailCloseButton onClose={onClose} />
        </div>
      </div>

      <ErrorBoundary
        boundaryName="source-detail"
        // NOT_FOUND는 삭제된 원문을 가리키는 죽은 링크에서 자연히 발생하는 예상된
        // 에러라 노이즈로 보고하지 않는다.
        shouldReport={(error) => !isNotFoundError(error)}
        fallbackRender={(fallbackProps) => (
          <SourceDetailPanelError {...fallbackProps} onClose={onClose} />
        )}
      >
        <Suspense fallback={<SourceDetailPanelSkeleton />}>
          {/* key={sourcePublicId} — 열려 있는 채로 다른 원문으로 바로 전환하면(패널을
              안 닫고 카드만 바꿔 클릭), 대상 원문 쿼리가 이미 캐시돼 있을 때(staleTime
              30초, gcTime 기본 5분) useSuspenseQuery가 다시 suspend하지 않아 이
              컴포넌트가 리마운트되지 않는다 — 그러면 스크롤 컨테이너 DOM이
              재사용돼 이전 원문에서 스크롤한 위치가 새 원문에 그대로 남는다. key로
              강제 리마운트시켜 이걸 막는다. */}
          <SourceDetailBody
            key={sourcePublicId}
            sourcePublicId={sourcePublicId}
            banner={banner}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
