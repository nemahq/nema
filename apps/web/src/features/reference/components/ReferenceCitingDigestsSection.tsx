import { Text } from "@nema-io/weave";

import type { ReferenceCitingDigest } from "@web/features/reference/types";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceCitingDigestsSectionProps {
  citingDigests: ReferenceCitingDigest[];
}

// 편집·삭제 없음 — 본문 @ 멘션에서 파생되는 역방향 목록이라 여기서 직접 추가·제거할
// 대상이 아니다(surface-inventory.md "Reference 목록/상세"). 클릭 시 그 Digest
// 탭을 여는 이동은 Digest 상세 화면 자체가 아직 없어 이번 스코프 밖으로 남긴다.
export function ReferenceCitingDigestsSection({
  citingDigests,
}: ReferenceCitingDigestsSectionProps) {
  const { t } = useTranslation();

  if (citingDigests.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" color="tertiary" weight="medium">
        {t("reference.citing_digests_label", { count: citingDigests.length })}
      </Text>
      <ul className="flex flex-col gap-1">
        {citingDigests.map((digest) => (
          <li key={digest.id}>
            <Text
              as="span"
              size="sm"
              color="secondary"
              className="line-clamp-1"
            >
              {digest.title}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}
