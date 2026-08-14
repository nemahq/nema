import type { DigestListItem, SourceWithDigests } from "@nema-io/shared";
import {
  Button,
  Separator,
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
  selectedDigestPublicId: string | null;
  onOpenSource: (source: SourceWithDigests) => void;
  onOpenDigest?: (digest: DigestListItem) => void;
}

export function SourceDigestGroup({
  source,
  selectedDigestPublicId,
  onOpenSource,
  onOpenDigest,
}: SourceDigestGroupProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 py-3">
      {/* 구분선은 이름과 우측 액션 사이에만 둔다 — 헤더의 구분선 자체가
          "여기서 새 원문이 시작한다"는 신호라, 행 사이·묶음 사이엔 따로 안 둔다.
          px-2는 DigestListRow(Link)의 호버 박스 여백과 같은 값 — 아래 다이제스트
          행과 좌우가 맞아떨어지게 맞춘다. */}
      <div className="flex items-center gap-2 px-2">
        <Text
          as="span"
          size="sm"
          weight="medium"
          className="min-w-0 max-w-80 shrink truncate"
        >
          {source.name}
        </Text>
        <div className="min-w-6 flex-1">
          <Separator />
        </div>
        <RelativeTime dateTime={source.createdAt} />
        {/* FileText는 이 앱이 이미 "원문 보기"에 쓰는 아이콘이다
            (legacy DigestSourceButton.tsx — Search는 검색 쿼리로 이미 쓰여서 제외). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("source.open_detail_label")}
              onClick={() => onOpenSource(source)}
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
            selected={digest.publicId === selectedDigestPublicId}
            onOpen={onOpenDigest}
          />
        ))}
      </div>
    </div>
  );
}
