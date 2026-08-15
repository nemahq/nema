import { josa } from "es-hangul";
import { Suspense, useSyncExternalStore } from "react";
import { Link, linkOptions } from "@tanstack/react-router";

import type { DigestRelationPerspective } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useDigestRelationsSuspenseQuery } from "@web/features/digest/hooks/useDigestRelationsQuery";
import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import { DigestRelationsBlockSkeleton } from "./DigestRelationsBlockSkeleton";
import { DigestTypeIcon } from "./DigestTypeIcon";

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

type JosaOption = Parameters<typeof josa.pick>[1];

// 조사만 뽑아 쓴다(josa()는 "제목+조사"를 통째로 반환해 칩 옆에 쓰면 제목이
// 두 번 보인다) — 칩이 이미 제목을 보여주므로 칩 밖 텍스트는 조사+관계어만
// 맡는다. 영어는 조사가 없어 이 문제 자체가 없다(정적 라벨, en.json 참고).
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
// 않는다). 0개면 콘텐츠 쪽에서 스스로 아무것도 렌더하지 않는다("없어요"를 쓰지
// 않는다 — 관계는 있으면 좋은 것이지 빈 자리가 문제인 곳이 아니다).
//
// 자체 ErrorBoundary로 감싼다(OnboardingGate와 같은 패턴) — 없으면 관계 조회
// 실패가 상위 DigestDetailPanel의 ErrorBoundary까지 번져 이미 로드된 본문까지
// 에러 화면으로 덮인다. 부가 정보 하나가 죽었다고 상세 전체가 무너지면 안 된다.
export function DigestRelationsBlock({ digestId }: DigestRelationsBlockProps) {
  return (
    <ErrorBoundary boundaryName="digest-relations" fallback={null}>
      <Suspense fallback={<DigestRelationsBlockSkeleton />}>
        <DigestRelationsBlockContent digestId={digestId} />
      </Suspense>
    </ErrorBoundary>
  );
}

// tolgee의 language 이벤트를 직접 구독한다 — useTranslate()가 구독하는 update
// 이벤트는 language도 포함하지만 그 안에 섞여 있어 이 자리에서 근거로 삼기엔
// 간접적이다. RelativeTime의 분 틱 구독과 같은 형태(subscribe/getSnapshot)로
// tolgee.getLanguage()를 직접 물어 리렌더를 보장한다.
function subscribeToLanguage(callback: () => void): () => void {
  const subscription = tolgee.on("language", callback);
  return () => subscription.unsubscribe();
}

function getLanguageSnapshot(): string | undefined {
  return tolgee.getLanguage();
}

function DigestRelationsBlockContent({ digestId }: DigestRelationsBlockProps) {
  const { t } = useTranslation();
  const [digestRelations] = useDigestRelationsSuspenseQuery(digestId);
  // 한국어는 "제목 칩 + 조사 + 관계어"로 목적어가 동사 앞에 오지만, 영어는
  // "Supports + 제목 칩"으로 동사가 먼저 와야 자연스럽게 읽힌다.
  const language = useSyncExternalStore(
    subscribeToLanguage,
    getLanguageSnapshot,
  );
  const isKorean = language === "ko";

  if (digestRelations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-2">
      <Text as="h3" size="sm" weight="medium" color="tertiary">
        {t("digest.relations_heading", { count: digestRelations.length })}
      </Text>
      <ul className="flex flex-col gap-1.5">
        {digestRelations.map((relation) => {
          // Chip이 아니라 Link다 — remove 없는 Chip은 항상 <button>이라
          // cmd/가운데 클릭 새 탭이 안 된다. 이 링크만 클릭 대상이고 줄 전체는
          // 아니다. rounded-full — DigestListRow처럼 목록에 늘어놓는 자리가
          // 아니라 문장 안에 끼는 낱말 하나라, 호버 배경도 pill 모양으로 감싼다.
          const chip = (
            <Link
              {...linkOptions({
                to: "/",
                search: { digest: relation.publicId },
              })}
              className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors duration-fast hover:bg-surface-raised-hover/40"
            >
              <DigestTypeIcon type={relation.digestType} />
              <Text as="span" size="sm" className="min-w-0 truncate">
                {relation.title}
              </Text>
            </Link>
          );
          const label = (
            <Text as="span" size="sm" className="shrink-0">
              {t(RELATION_LABEL_KEY[relation.type], {
                // 원본 제목 기준으로 계산한다 — 칩 안에서 말줄임으로 잘려도 조사는
                // 그대로 둔다. 말줄임은 시각적 축약일 뿐이라 의도된 것이다.
                josa: josa.pick(relation.title, RELATION_JOSA[relation.type]),
              })}
            </Text>
          );

          return (
            <li
              key={relation.digestId}
              className="flex min-w-0 items-center gap-1"
            >
              {isKorean ? (
                <>
                  {chip}
                  {label}
                </>
              ) : (
                <>
                  {label}
                  {chip}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
