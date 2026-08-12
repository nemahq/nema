import { Link } from "@tanstack/react-router";

import type { DigestListEntry } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { DigestTypeBadge } from "@web/features/digest/components/DigestTypeBadge";

interface DigestListItemProps {
  entry: DigestListEntry;
}

export function DigestListItem({ entry }: DigestListItemProps) {
  return (
    <Link
      to="/digest/$digestId"
      params={{ digestId: entry.id }}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-card p-4 transition-colors duration-fast hover:bg-surface-raised-hover"
    >
      <div className="flex items-center gap-2">
        <DigestTypeBadge type={entry.type} />
        <RelativeTime dateTime={entry.createdAt} />
      </div>
      <Text as="h3" size="base" weight="semibold" color="primary">
        {entry.title}
      </Text>
      {entry.statement && (
        <Text as="p" size="sm" color="secondary">
          {entry.statement.content}
        </Text>
      )}
    </Link>
  );
}
