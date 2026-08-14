import { josa } from "es-hangul";
import { Suspense } from "react";
import { Link, linkOptions } from "@tanstack/react-router";

import type { DigestRelationPerspective } from "@nema-io/shared";
import { Badge, Text } from "@nema-io/weave";

import { useDigestRelationsSuspenseQuery } from "@web/features/digest/hooks/useDigestRelationsQuery";
import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

interface DigestRelationsBlockProps {
  digestId: string;
}

const RELATION_LABEL_KEY: Record<DigestRelationPerspective, TranslationKey> = {
  supports: "digest.relation_supports",
  supported_by: "digest.relation_supported_by",
  weakens: "digest.relation_weakens",
  weakened_by: "digest.relation_weakened_by",
  duplicate_of: "digest.relation_duplicate_of",
  conflicts_with: "digest.relation_conflicts_with",
};

type JosaOption = Parameters<typeof josa>[1];

// 한국어 문구만 조사가 필요하다 — 제목이 문장 끝에 온다("{titleWithJosa} 지지").
// 영어는 제목이 앞머리에 안 와서("Supports {title}") 조사 자체가 필요 없다.
const RELATION_JOSA: Record<DigestRelationPerspective, JosaOption> = {
  supports: "을/를",
  supported_by: "으로부터/로부터",
  weakens: "을/를",
  weakened_by: "으로부터/로부터",
  duplicate_of: "와/과",
  conflicts_with: "와/과",
};

// 다이제스트 상세 — CandidateCardFrame 아래 형제로 놓는 「관련 다이제스트」 블록.
// 유일한 소비처라 관계 조회를 직접 들고 있는다(page가 fetch해 prop-drill하지
// 않는다). fallback을 null로 둔다 — 로딩 중에도, 0개일 때도 아무것도 안 보인다
// ("없어요"를 쓰지 않는다 — 관계는 있으면 좋은 것이지 빈 자리가 문제인 곳이 아니다).
export function DigestRelationsBlock({ digestId }: DigestRelationsBlockProps) {
  return (
    <Suspense fallback={null}>
      <DigestRelationsBlockContent digestId={digestId} />
    </Suspense>
  );
}

function DigestRelationsBlockContent({ digestId }: DigestRelationsBlockProps) {
  const { t } = useTranslation();
  const [digestRelations] = useDigestRelationsSuspenseQuery(digestId);

  if (digestRelations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-2">
      <Text as="h3" size="sm" weight="medium" color="tertiary">
        {t("digest.relations_heading", { count: digestRelations.length })}
      </Text>
      <ul className="flex flex-col gap-1.5">
        {digestRelations.map((relation) => (
          <li
            key={relation.digestId}
            className="flex min-w-0 items-center gap-1"
          >
            {/* Chip이 아니라 Link+Badge다 — remove 없는 Chip은 항상 <button>이라
                cmd/가운데 클릭 새 탭이 안 된다. 칩만 클릭 대상이고 줄 전체는
                아니다. */}
            <Link
              {...linkOptions({
                to: "/",
                search: { digest: relation.publicId },
              })}
              className="flex min-w-0"
            >
              <Badge shape="pill" variant="outline" truncated>
                {relation.title}
              </Badge>
            </Link>
            <Text as="span" size="sm" color="tertiary" className="shrink-0">
              {t(RELATION_LABEL_KEY[relation.type], {
                title: relation.title,
                // 원본 제목 기준으로 계산한다 — 칩 안에서 말줄임으로 잘려도 조사는
                // 그대로 둔다. 말줄임은 시각적 축약일 뿐이라 의도된 것이다.
                titleWithJosa: josa(
                  relation.title,
                  RELATION_JOSA[relation.type],
                ),
              })}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}
