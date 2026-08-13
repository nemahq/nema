import type { SourceWithDigests } from "@nema-io/shared";
import {
  Button,
  cn,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useTranslation } from "@web/lib/tolgee";

import { DigestListRow } from "./DigestListRow";

interface SourceDigestGroupProps {
  source: SourceWithDigests;
  hideDivider?: boolean;
  selectedDigestId: string | null;
  onSelectDigest: (digestId: string) => void;
  onOpenSource: (sourceId: string) => void;
}

export function SourceDigestGroup({
  source,
  hideDivider,
  selectedDigestId,
  onSelectDigest,
  onOpenSource,
}: SourceDigestGroupProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col gap-1 py-3",
        !hideDivider && "border-b border-border-subtle",
      )}
    >
      <div className="flex items-center gap-2">
        <Text
          as="span"
          size="sm"
          weight="medium"
          className="min-w-0 flex-1 truncate"
        >
          {source.name}
        </Text>
        <RelativeTime dateTime={source.createdAt} />
        {/* FileText는 이 앱이 이미 "원문 보기"에 쓰는 아이콘이다
            (legacy DigestSourceButton.tsx — Search는 검색 쿼리로 이미 쓰여서 제외). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("source.open_detail_label")}
              onClick={() => onOpenSource(source.sourceId)}
              className="size-7 text-fg-tertiary"
            >
              <FileText className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("source.open_detail_label")}
          </TooltipContent>
        </Tooltip>
      </div>
      {/* 다이제스트를 전부 걷어내면 헤더만 남는다 — 원문으로 들어가는 문은
          남아야 해서 서버가 그 원문 행을 계속 내려준다. */}
      <div className="flex flex-col">
        {source.digests.map((digest) => (
          <DigestListRow
            key={digest.id}
            digest={digest}
            selected={digest.id === selectedDigestId}
            onSelect={onSelectDigest}
          />
        ))}
      </div>
    </div>
  );
}
