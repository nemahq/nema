import { type ReactNode, Suspense } from "react";

import {
  Button,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useSourceSuspenseQuery } from "@web/features/source/hooks/useSourceQuery";
import { useTranslation } from "@web/lib/tolgee";

import { SourceBodyView } from "./SourceBodyView";
import { SourceDeleteMenu } from "./SourceDeleteMenu";

interface SourceDetailPanelProps {
  sourceId: string;
  onClose: () => void;
  // 헤더의 미트볼 메뉴 앞에 두는 컨텍스트별 슬롯 — 소비처 전용 상태·액션을 주입한다
  // (예: 초안 화면에 나중에 필요해질 표시). 기본은 비어 있다 — 이 컴포넌트 안에는
  // 특정 소비처 전용 로직을 두지 않는다.
  headerActions?: ReactNode;
}

function SourceDetailPanelContent({
  sourceId,
  onClose,
  headerActions,
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
          {headerActions}
          <SourceDeleteMenu sourceId={sourceId} onDeleted={onClose} />
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
        </div>
      </div>

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

// 원문 상세 — SidePanel 안에 얹는 공용 콘텐츠. 초안 화면과, 후속으로 붙는 다이제스트
// 목록 화면이 같은 컴포넌트로 원문 상세를 연다.
export function SourceDetailPanel(props: SourceDetailPanelProps) {
  return (
    <Suspense fallback={<LoadingWatermark />}>
      <SourceDetailPanelContent {...props} />
    </Suspense>
  );
}
