import { Suspense, useState } from "react";

import type { ReviewTopicDraft } from "@nema-io/shared";

import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import {
  buildDraftRenameDuplicateCheck,
  buildLabelSearchState,
  filterDraftLabelCandidates,
  getActiveLabelTitles,
} from "@web/utils/labelSearch";

import { LabelDraftEditPopover } from "./LabelDraftEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { TopicDraftRenameForm } from "./TopicDraftRenameForm";

interface ReviewTopic {
  id: string;
  title: string;
}

interface TopicSearchListProps {
  spaceId: string;
  query: string;
  // 지금 이 Digest에 붙은 Topic — "붙음" 표시 판정에만 쓴다.
  attachedTopics: ReviewTopicDraft[];
  // 리뷰 팔레트 전체(#28) — draft 후보와 중복 이름 판정 풀은 이제 이 Digest
  // 하나가 아니라 리뷰 전체를 본다.
  paletteTopics: ReviewTopicDraft[];
  // 라벨 5개 상한(DIGEST_TOPICS_MAX)에 닿아 더 못 붙이는 상태 — 검색·만들기·
  // 레지스트리 후보는 숨기되, 이미 붙은 신규 라벨만 남겨 미트볼(삭제)에는
  // 계속 닿을 수 있게 한다(신규 라벨 삭제는 상한과 무관하게 항상 가능해야 함).
  atMax: boolean;
  onSelectExisting: (topic: ReviewTopic) => void;
  onCreateNew: (name: string) => void;
  onRenameDraft: (id: string, title: string) => void;
  onDeleteDraft: (id: string) => void;
}

const getTopicLabel = (topic: { title: string }) => topic.title;

// 검색 리스트 한 줄의 정렬 정체성 — draft(신규)/candidate(레지스트리 기존) 중
// 하나만 갖고, attached는 둘 다 공유한다.
type TopicSearchRow =
  | { kind: "draft"; topic: ReviewTopicDraft; attached: boolean }
  | { kind: "candidate"; topic: ReviewTopic; attached: boolean };

function TopicSearchListContent({
  spaceId,
  query,
  attachedTopics,
  paletteTopics,
  atMax,
  onSelectExisting,
  onCreateNew,
  onRenameDraft,
  onDeleteDraft,
}: TopicSearchListProps) {
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  // 한 번에 하나만 편집 — 이미 열린 걸 그대로 두면 두 편집이 같은 팔레트를
  // 동시에 patch하려다 서로의 변경을 덮어쓸 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { candidates, trimmedQuery, canCreate } = buildLabelSearchState({
    items: topicList.topics,
    getLabel: getTopicLabel,
    query,
    existingLabels: paletteTopics.map((topic) => topic.title),
  });
  const attachedIds = new Set(attachedTopics.map((topic) => topic.id));
  const draftMatches = filterDraftLabelCandidates(paletteTopics, query);
  const activeRegistryTitles = getActiveLabelTitles(
    topicList.topics,
    getTopicLabel,
  );

  // 상한에 닿으면 레지스트리 후보는 아예 안 보여준다(어차피 못 붙이니까) —
  // 이미 붙은 신규 라벨만 남겨 미트볼(삭제)에는 계속 닿게 한다.
  const visibleDraftMatches = atMax
    ? draftMatches.filter((draft) => attachedIds.has(draft.id))
    : draftMatches;
  const visibleCandidates = atMax ? [] : candidates;

  const rows: TopicSearchRow[] = [
    ...visibleDraftMatches.map(
      (draft): TopicSearchRow => ({
        kind: "draft",
        topic: draft,
        attached: attachedIds.has(draft.id),
      }),
    ),
    ...visibleCandidates.map(
      (topic): TopicSearchRow => ({
        kind: "candidate",
        topic,
        attached: attachedIds.has(topic.id),
      }),
    ),
  ];
  // 붙음이 1차 기준, 신규가 2차 기준 — 배열을 draft 먼저 이어붙였으므로 같은
  // 그룹 안에서는 stable sort가 원래 순서를 그대로 지킨다.
  const sortedRows = [...rows].sort(
    (a, b) =>
      (a.attached ? 0 : 1) - (b.attached ? 0 : 1) ||
      (a.kind === "draft" ? 0 : 1) - (b.kind === "draft" ? 0 : 1),
  );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={sortedRows.length > 0}
      canCreate={atMax ? false : canCreate}
      onStartCreate={onCreateNew}
    >
      {sortedRows.map((row) =>
        row.kind === "draft" ? (
          <LabelSearchRow
            key={row.topic.id}
            label={row.topic.title}
            attached={row.attached}
            isNew
            onSelect={() => onSelectExisting(row.topic)}
            actions={
              <LabelDraftEditPopover
                open={editingId === row.topic.id}
                onOpenChange={(open) =>
                  setEditingId(open ? row.topic.id : null)
                }
              >
                <TopicDraftRenameForm
                  title={row.topic.title}
                  isDuplicateTitle={buildDraftRenameDuplicateCheck({
                    registryLabels: activeRegistryTitles,
                    digestLabels: paletteTopics,
                    excludeId: row.topic.id,
                  })}
                  onCommitText={(title) => onRenameDraft(row.topic.id, title)}
                  onDelete={() => onDeleteDraft(row.topic.id)}
                />
              </LabelDraftEditPopover>
            }
          />
        ) : (
          <LabelSearchRow
            key={row.topic.id}
            label={row.topic.title}
            attached={row.attached}
            onSelect={() => onSelectExisting(row.topic)}
          />
        ),
      )}
    </LabelSearchList>
  );
}

// enabled 대신 마운트로 게이팅한다 — 이 트리는 팝오버가 열렸을 때만 그려진다.
export function TopicSearchList(props: TopicSearchListProps) {
  return (
    <LabelSearchSection boundaryName="topic-search">
      <Suspense fallback={<LabelSearchSkeleton />}>
        <TopicSearchListContent {...props} />
      </Suspense>
    </LabelSearchSection>
  );
}
