import { Suspense, useState } from "react";

import { DIGEST_TOPICS_MAX, type DigestTopicDraft } from "@nema-io/shared";
import { Badge, cn, Separator, Skeleton, Text } from "@nema-io/weave";
import { XIcon } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import { useCurrentSpaceId } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/utils/labelSearch";

// 실제 태그 이름 길이가 제각각인 것처럼 스켈레톤 폭도 다양하게 둔다 — 전부
// 같은 폭이면 진짜 데이터가 아니라 UI 장식처럼 보인다.
const SEARCH_SKELETON_WIDTHS = ["w-16", "w-24", "w-12"];

interface TopicSearchListProps {
  spaceId: string;
  query: string;
  excludedTopicIds: string[];
  existingLabels: string[];
  onSelectExisting: (topic: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
}

// 로직(필터·중복 판정)은 TopicAddPopover의 TopicSearchResults와 같은 유틸을
// 재사용하지만, 마크업은 새로 짠다 — Notion처럼 이 팝오버 전체가 하나의 편집
// 표면이라 별도 팝오버로 검색 결과를 또 띄우지 않고 같은 화면에 바로 이어 붙인다.
// 목록 행도 TopicSearchResults와 같은 이유로 raw button — 전체 폭 hover 행이라
// weave Button의 고정 패딩·타이포가 안 맞는다. 리스트 마크업(ul/li)·빈 목록 높이
// (max-h-48)는 TopicSearchResults와 그대로 맞춘다 — 목록 자체의 성격이 같아서
// 여기서만 다르게 할 이유가 없다.
function TopicSearchList({
  spaceId,
  query,
  excludedTopicIds,
  existingLabels,
  onSelectExisting,
  onCreateNew,
}: TopicSearchListProps) {
  const { t } = useTranslation();
  const [topicList] = useTopicListSuspenseQuery(spaceId);

  const getLabel = (topic: { name: string }) => topic.name;
  const candidates = filterActiveLabelCandidates(
    topicList.topics,
    getLabel,
    query,
    new Set(excludedTopicIds),
  );
  const trimmed = query.trim();
  const hasExactMatch = hasExactLabelMatch(candidates, getLabel, query);
  const canCreateNew =
    trimmed !== "" &&
    !hasExactMatch &&
    !isDuplicateLabelName(trimmed, existingLabels);

  return (
    <>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {candidates.map((topic) => (
          <li key={topic.id}>
            {/* 후보 이름을 위 칩 목록과 같은 Badge로 감싼다 — 선택하면 그대로 저
                모양의 칩이 된다는 걸 고르기 전에 미리 보여준다. 행 자체(버튼)는
                그대로 두고 내용만 Badge로 바꿔서 히트박스는 안 줄어든다. 행
                자체엔 좌우 패딩을 안 준다 — Badge가 이미 자기 padding(px-2)을
                갖고 있어서, 행에 또 주면 팝오버 가장자리부터 텍스트까지 이중으로
                밀려 과하게 벌어진다. */}
            <button
              type="button"
              onClick={() => onSelectExisting(topic)}
              className="flex w-full items-center rounded-sm py-1 text-left hover:bg-surface-raised-hover"
            >
              <Badge variant="outline-value" shape="rounded" truncated>
                {topic.name}
              </Badge>
            </button>
          </li>
        ))}
        {/* "일치하는 항목이 없어요"는 검색이 실패했다는 뜻이라, 검색어 없이도
            뜨는 이 상태(Space에 주제가 있지만 이미 다 골라서 후보가 0개)엔 안
            맞는다 — "이미 모두 추가했어요"로 원인을 구분해서 보여준다. */}
        {candidates.length === 0 && trimmed === "" && (
          <Text as="li" size="sm" color="tertiary" className="px-2 py-1">
            {t(
              topicList.topics.length > 0
                ? "review.label_search_all_added"
                : "review.label_search_empty",
            )}
          </Text>
        )}
      </ul>
      {trimmed !== "" && !hasExactMatch && (
        <button
          type="button"
          disabled={!canCreateNew}
          onClick={() => onCreateNew(trimmed)}
          className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left hover:bg-surface-raised-hover disabled:pointer-events-none disabled:text-fg-quinary"
        >
          {/* Badge를 문장 안에 끼우기 위해 앞/뒤 문구를 분리한다 — tolgee의
              t()는 문자열 파라미터만 받아 컴포넌트를 끼워 넣을 수 없다(어순이
              언어마다 달라 국문은 뒤쪽, 영문은 앞쪽에 문구가 붙는다). */}
          <Text as="span" size="sm">
            {t("review.label_create_new_before")}
          </Text>
          <Badge variant="outline-value" shape="rounded" truncated>
            {trimmed}
          </Badge>
          <Text as="span" size="sm">
            {t("review.label_create_new_after")}
          </Text>
        </button>
      )}
    </>
  );
}

interface TopicEditPanelProps {
  topics: DigestTopicDraft[];
  disabled: boolean;
  onChange: (topics: DigestTopicDraft[]) => void;
}

// 색은 안 쓴다 — Topic은 조용하게 두고 테두리로만 구분한다(이번 라운드 원칙).
// shape는 각진 기본값 — 여러 개를 나란히 늘어놓는 자리라 pill이 아니다. 제거
// 버튼은 hover-reveal이 아니라 상시 노출 — 팝오버를 연 시점 자체가 편집 의도가
// 명확해서다.
// weave Button 대신 raw button인 이유는 칩 안에서 Badge의 색·크기를 물려받아야
// 하는데 Button base가 자기 타이포를 강제해 안 맞기 때문(weave-usage.md "칩·pill
// 안 버튼" 제외 규칙, LabelChipShell과 같은 이유).
//
// Notion 참고 — 칩이 놓인 우측 영역 자체가 인풋이라 거기서 바로 검색·추가가
// 된다(design-decisions-log.md). 그래서 칩 목록과 검색 입력을 별도 팝오버로
// 안 쪼개고, 테두리 있는 한 박스 안에 같이 둔다.
export function TopicEditPanel({
  topics,
  disabled,
  onChange,
}: TopicEditPanelProps) {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const [query, setQuery] = useState("");
  const atMax = topics.length >= DIGEST_TOPICS_MAX;

  function removeAt(index: number) {
    onChange(topics.filter((_, i) => i !== index));
  }

  function handleSelectExisting(topic: { id: string; name: string }) {
    onChange([...topics, topic]);
    setQuery("");
  }

  function handleCreateNew(name: string) {
    onChange([...topics, { id: null, name }]);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
        {topics.map((topic, index) => (
          <Badge
            key={topic.id ?? `draft-${index}`}
            variant="outline-value"
            shape="rounded"
            className="inline-flex items-center gap-1 py-0.5 pr-1"
          >
            {topic.name}
            <button
              type="button"
              disabled={disabled}
              aria-label={t("review.topic_remove_action")}
              onClick={() => removeAt(index)}
              className="rounded-full p-0.5 text-current/70 hover:bg-fg-primary/15 disabled:pointer-events-none"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        {!atMax && (
          // weave Input 대신 raw — border·h-9·px-3 같은 base chrome을 걷어내면
          // 남는 게 없어서, 칩과 한 행에 이어 붙는 무테두리 인라인 입력엔 안 맞는다
          // (TopicAddPopover의 독립형 Input과는 자리 성격이 다름). placeholder를
          // 여기 안 두는 이유 — 칩이 쌓일수록 이 인풋 자체가 좁아져 placeholder
          // 문구가 잘릴 수 있어서, 안내문은 아래 리스트 위 고정 폭 자리에 따로 둔다.
          <input
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-[4rem] flex-1 border-none bg-transparent text-sm outline-none disabled:pointer-events-none"
          />
        )}
      </div>
      {atMax ? (
        // 검색 UI를 통째로 숨기기만 하면 "왜 안 되는지" 설명이 없어 고장난
        // 것처럼 보인다 — 개수 제한에 걸렸다는 걸 직접 알려준다.
        <>
          <Separator />
          <Text size="xs" color="tertiary" className="px-2 pb-2">
            {t("review.topic_max_reached", { max: DIGEST_TOPICS_MAX })}
          </Text>
        </>
      ) : (
        <>
          <Separator />
          {/* 좌우 패딩을 두 겹으로 — 이 래퍼의 px-2는 리스트 자체를 팝오버
              가장자리에서 띄우고(DropdownMenuContent의 p-1 스크롤 래퍼와 같은
              역할), 행 각각의 px-2는 그 행(hover 하이라이트 박스) 안에서 배지·
              텍스트를 다시 한 번 안쪽으로 띄운다(DropdownMenuItem의 px-2와 같은
              역할). 안내문은 행이 아니라 리스트 자체 지시문이라 래퍼 인셋 하나로
              충분하다. */}
          <div className="flex flex-col gap-2 px-2 pb-2">
            <Text size="xs" color="tertiary">
              {t("review.label_search_placeholder")}
            </Text>
            <ErrorBoundary
              boundaryName="topic-search"
              fallbackRender={() => (
                <ul>
                  <Text as="li" size="sm" color="error" className="px-2 py-1">
                    {t("review.label_search_error")}
                  </Text>
                </ul>
              )}
            >
              <Suspense
                fallback={
                  // 스피너·"불러오는 중" 텍스트 대신 스켈레톤 — DraftSpaceSelect와
                  // 같은 원칙(로딩엔 스피너 대신 스켈레톤). 실제 후보 행처럼 칩
                  // 모양(rounded-[4px] px-2 py-0.5)을 흐릿하게 미리 보여준다.
                  <ul className="flex flex-col gap-0.5 py-1">
                    {SEARCH_SKELETON_WIDTHS.map((width, index) => (
                      <li key={index} className="px-2 py-1">
                        <Skeleton
                          className={cn("h-[19px] rounded-[4px]", width)}
                        />
                      </li>
                    ))}
                  </ul>
                }
              >
                <TopicSearchList
                  spaceId={spaceId}
                  query={query}
                  excludedTopicIds={topics
                    .map((topic) => topic.id)
                    .filter((id): id is string => id !== null)}
                  existingLabels={topics.map((topic) => topic.name)}
                  onSelectExisting={handleSelectExisting}
                  onCreateNew={handleCreateNew}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}
