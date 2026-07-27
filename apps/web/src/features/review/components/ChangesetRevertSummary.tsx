import { Link, linkOptions } from "@tanstack/react-router";

import { Text } from "@nema-io/weave";

import { useSpacePublicId } from "@web/hooks/useSpacePublicId";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetRevertSummaryProps {
  revertsNumber: number;
}

// BE는 이미 모든 changeset에 revertsNumber를 채워 돌려준다(reverts_id가 있으면
// 항상 조회) — 이 화면은 그 값을 링크로 보여주기만 하면 되고 별도 조회가 없다.
// 원본 changeset 자체의 스냅샷은 여기 다시 얼리지 않는다(되돌리기는 append-only라
// 원본이 그대로 남아있어, 그 상세로 보내는 것으로 충분하다).
export function ChangesetRevertSummary({
  revertsNumber,
}: ChangesetRevertSummaryProps) {
  const { t } = useTranslation();
  const spacePublicId = useSpacePublicId();

  return (
    <div className="flex items-center gap-1.5">
      <Text as="span" color="tertiary">
        {t("review.detail_revert_body")}
      </Text>
      <Link
        {...linkOptions({
          to: "/space/$spacePublicId/changesets/$changesetNumber",
          params: {
            spacePublicId,
            changesetNumber: String(revertsNumber),
          },
        })}
        className="font-medium text-brand-accent hover:underline"
      >
        #{revertsNumber}
      </Link>
    </div>
  );
}
