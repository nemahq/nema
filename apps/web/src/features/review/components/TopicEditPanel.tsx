import { Suspense, useState } from "react";

import { DIGEST_TOPICS_MAX, type DigestTopicDraft } from "@nema-io/shared";
import {
  Badge,
  Button,
  Chip,
  cn,
  LIST_ITEM_HOVER_CLASSNAME,
  NESTED_HOVER_ICON_CLASSNAME,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Text,
} from "@nema-io/weave";
import { Ellipsis } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import { useUpdateTopic } from "@web/features/review/hooks/useUpdateTopic";
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
  // 이 Digest에 이미 붙은 Topic도 목록에서 그대로 보여준다(더 이상 제외하지
  // 않음) — 이름·설명 수정 진입점을 "붙은 것"과 "안 붙은 것" 둘로 안 쪼개고
  // 이 목록 하나로 통일하기 위해서다. 대신 이미 붙은 행은 클릭해도 다시
  // 붙지 않는다(neutral 톤으로 표시).
  attachedTopicIds: Set<string>;
  existingLabels: string[];
  onSelectExisting: (topic: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
  onRenamed: (topic: { id: string; name: string }) => void;
}

// Notion처럼 이 팝오버 전체가 하나의 편집 표면이라, 별도 팝오버로 검색 결과를
// 또 띄우지 않고 같은 화면에 바로 이어 붙인다. 목록 행은 raw button — 전체 폭
// hover 행이라 weave Button의 고정 패딩·타이포가 안 맞는다.
function TopicSearchList({
  spaceId,
  query,
  attachedTopicIds,
  existingLabels,
  onSelectExisting,
  onCreateNew,
  onRenamed,
}: TopicSearchListProps) {
  const { t } = useTranslation();
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  const updateTopic = useUpdateTopic();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const getLabel = (topic: { name: string }) => topic.name;
  const candidates = filterActiveLabelCandidates(
    topicList.topics,
    getLabel,
    query,
    new Set(),
  );
  const trimmed = query.trim();
  const hasExactMatch = hasExactLabelMatch(candidates, getLabel, query);
  const canCreateNew =
    trimmed !== "" &&
    !hasExactMatch &&
    !isDuplicateLabelName(trimmed, existingLabels);

  function startEditing(topic: { id: string; name: string }) {
    setEditingId(topic.id);
    setEditingName(topic.name);
  }

  // 버튼(저장/취소) 없이 메뉴처럼 — 오버레이가 어떻게 닫히든(바깥 클릭·Escape·
  // Enter) 그 시점의 값을 그대로 적용한다. 바뀐 게 없거나 빈 값이면 조용히
  // 원래 이름을 유지한다(빈 이름 저장은 애초에 막혀야 함).
  function applyAndClose(topic: { id: string; name: string }) {
    const name = editingName.trim();
    if (name !== "" && name !== topic.name) {
      updateTopic.mutate(
        { id: topic.id, name },
        { onSuccess: () => onRenamed({ id: topic.id, name }) },
      );
    }
    setEditingId(null);
  }

  return (
    <>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {candidates.map((topic) => {
          const attached = attachedTopicIds.has(topic.id);
          const isEditing = editingId === topic.id;
          return (
            <li key={topic.id}>
              <div
                className={cn(
                  "group flex w-full items-center",
                  LIST_ITEM_HOVER_CLASSNAME,
                  "rounded-sm",
                  // 팝오버가 열려 있는 동안은 마우스가 팝오버 쪽으로 옮겨가
                  // 행에서 벗어나도(:hover가 풀려도) 계속 활성 톤으로 보이게
                  // 강제한다 — 안 그러면 편집 중인데 행이 비활성처럼 보인다.
                  isEditing && "bg-surface-raised-hover/40",
                )}
              >
                {/* 후보 이름을 위 칩 목록과 같은 Badge로 감싼다 — 선택하면
                    그대로 저 모양의 칩이 된다는 걸 고르기 전에 미리
                    보여준다. 이미 붙은 행은 neutral 톤(위쪽 칩과 다른 톤)
                    으로 구분하고 클릭해도 다시 안 붙는다(disabled). */}
                <button
                  type="button"
                  disabled={attached}
                  onClick={() => onSelectExisting(topic)}
                  className="flex min-w-0 flex-1 items-center py-1 text-left disabled:pointer-events-none"
                >
                  <Badge
                    variant={attached ? "neutral" : "outline"}
                    shape="rounded"
                    truncated
                  >
                    {topic.name}
                  </Badge>
                </button>
                {/* 수정은 이 행 안에서 펼쳐지는 대신, Notion의 프로퍼티 값
                    수정 패널처럼 팝오버 옆(오른쪽)에 따로 뜬다 — 이 리스트가
                    좁아서 안에서 펼치면 다른 행들을 밀어내거나 잘린다.
                    open을 editingId로 직접 몰아서, 트리거 클릭뿐 아니라
                    바깥 클릭·Escape로 닫힐 때도 startEditing/applyAndClose가
                    항상 같이 실행되게 한다 — 버튼이 없어 이 경로가 유일한
                    저장 시점이다. */}
                <Popover
                  open={isEditing}
                  onOpenChange={(open) => {
                    if (open) {
                      startEditing(topic);
                    } else {
                      applyAndClose(topic);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("review.label_edit_action")}
                      className={cn(
                        NESTED_HOVER_ICON_CLASSNAME,
                        "shrink-0 text-fg-tertiary opacity-0 transition-none focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
                      )}
                    >
                      <Ellipsis className="size-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    className="w-64 p-2"
                  >
                    {/* weave Input 대신 raw — h-9 고정 높이가 이 좁은
                        패널엔 과하다(다른 인라인 편집 입력들과 동일 사정).
                        테두리는 살려서 "이건 입력 필드다"가 보이게 한다 —
                        메뉴처럼 라벨·버튼은 없앴지만, 값 자체는 팝오버
                        배경과 구분돼야 한다. Enter는 즉시 적용·닫기 —
                        버튼이 없어 바깥 클릭 말고 키보드로도 끝낼 방법이
                        있어야 한다. */}
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          applyAndClose(topic);
                        }
                      }}
                      className="w-full min-w-0 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-fg-primary outline-none focus-visible:border-brand dark:focus-visible:border-fg-tertiary/70"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </li>
          );
        })}
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
          className="flex w-full items-center gap-1 rounded-sm py-1 text-left hover:bg-surface-raised-hover disabled:pointer-events-none disabled:text-fg-quinary"
        >
          {/* px-2를 안 두는 이유는 위 후보 행과 동일 — Badge가 이미 자기
              패딩(px-2)을 갖고 있어 행에 또 주면 이중으로 밀린다. 국문은
              label_create_new_before가 빈 문자열이라 이 값이 특히 중요하다
              (아니면 Badge 앞에 눈에 띄는 여백이 생긴다).
              Badge를 문장 안에 끼우기 위해 앞/뒤 문구를 분리한다 — tolgee의
              t()는 문자열 파라미터만 받아 컴포넌트를 끼워 넣을 수 없다(어순이
              언어마다 달라 국문은 뒤쪽, 영문은 앞쪽에 문구가 붙는다). */}
          <Text as="span" size="sm">
            {t("review.label_create_new_before")}
          </Text>
          <Badge variant="outline" shape="rounded" truncated>
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
// shape="rounded"를 명시하는 이유 — Chip 기본값은 pill인데, 여러 개를 나란히
// 늘어놓는 이 자리엔 pill이 아니라 각진 모양이 맞다.
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

  // 이름 수정은 검색 리스트(다른 컴포넌트)에서 일어나지만, 그 결과를 이
  // Digest가 이미 붙여둔 topics 배열에도 바로 반영해야 위쪽 칩·바깥 트리거가
  // 새로고침 없이 새 이름을 보여준다.
  function handleRenamed(renamed: { id: string; name: string }) {
    onChange(
      topics.map((topic) =>
        topic.id === renamed.id ? { ...topic, name: renamed.name } : topic,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
        {topics.map((topic, index) => (
          <Chip
            key={topic.id ?? `draft-${index}`}
            variant="outline"
            shape="rounded"
            disabled={disabled}
            onRemove={() => removeAt(index)}
            removeAriaLabel={t("review.topic_remove_action", {
              label: topic.name,
            })}
          >
            {topic.name}
          </Chip>
        ))}
        {!atMax && (
          // weave Input 대신 raw — border·h-9·px-3 같은 base chrome을 걷어내면
          // 남는 게 없어서, 칩과 한 행에 이어 붙는 무테두리 인라인 입력엔 안 맞는다.
          // placeholder를 여기 안 두는 이유 — 칩이 쌓일수록 이 인풋 자체가 좁아져
          // placeholder 문구가 잘릴 수 있어서, 안내문은 아래 리스트 위 고정 폭
          // 자리에 따로 둔다.
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
                  attachedTopicIds={
                    new Set(
                      topics
                        .map((topic) => topic.id)
                        .filter((id): id is string => id !== null),
                    )
                  }
                  existingLabels={topics.map((topic) => topic.name)}
                  onSelectExisting={handleSelectExisting}
                  onCreateNew={handleCreateNew}
                  onRenamed={handleRenamed}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}
