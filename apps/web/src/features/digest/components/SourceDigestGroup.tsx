import type { SourceWithDigests } from "@nema-io/shared";
import { cn, Text } from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";

import { DigestListRow } from "./DigestListRow";

interface SourceDigestGroupProps {
  source: SourceWithDigests;
  hideDivider?: boolean;
}

export function SourceDigestGroup({
  source,
  hideDivider,
}: SourceDigestGroupProps) {
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
        {/* 펼침 아이콘은 자리만 잡는다 — 누르면 열리는 원문 상세는 T4가 만든다.
            FileText는 이 앱이 이미 "원문 보기"에 쓰는 아이콘이다
            (legacy DigestSourceButton.tsx — Search는 검색 쿼리로 이미 쓰여서 제외). */}
        <FileText
          aria-hidden="true"
          className="size-3.5 shrink-0 text-fg-quinary"
        />
      </div>
      <div className="flex flex-col pl-1">
        {source.digests.map((digest) => (
          <DigestListRow key={digest.id} digest={digest} />
        ))}
      </div>
    </div>
  );
}
