import { Skeleton, Text, TextSkeleton } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { DigestTypeBadge } from "@web/features/digest/components/DigestTypeBadge";
import { useDigestQuery } from "@web/features/digest/hooks/useDigestQuery";
import { useTranslation } from "@web/lib/tolgee";

interface DigestDetailPageProps {
  digestId: string;
}

export function DigestDetailPage({ digestId }: DigestDetailPageProps) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useDigestQuery(digestId);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <NavigationBar
        items={[
          { label: t("digest.nav_label"), to: "/" },
          { label: data?.title ?? "" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
          {isPending && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-16 rounded-full" />
              <TextSkeleton size="xl" className="w-2/3" />
              <TextSkeleton size="base" className="w-full" />
              <TextSkeleton size="base" className="w-full" />
            </div>
          )}
          {isError && (
            <Text as="p" size="sm" color="tertiary">
              {t("digest.detail_not_found")}
            </Text>
          )}
          {data && (
            <>
              <div className="flex items-center gap-2">
                <DigestTypeBadge type={data.type} />
              </div>
              <Text as="h1" size="xl" weight="semibold" color="primary">
                {data.title}
              </Text>
              {data.statement && (
                <Text as="p" size="base" color="primary">
                  {data.statement.content}
                </Text>
              )}
            </>
          )}
          {/* 관계(statement_relations)는 엔진 슬라이스 5에서 온다 — 그 전까지 자리를 비워둔다. */}
        </div>
      </div>
    </div>
  );
}
