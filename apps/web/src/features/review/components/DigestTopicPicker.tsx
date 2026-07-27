import type { DigestTopicDraft } from "@nema-io/shared";
import {
  cn,
  OUTLINE_TONE_CLASSNAME,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@nema-io/weave";
import { Circle, Plus } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { NewLabelIndicator } from "./NewLabelIndicator";
import { useReviewDraftContext } from "./ReviewDraftProvider";
import { TopicEditPanel } from "./TopicEditPanel";

interface DigestTopicPickerProps {
  digestId: string;
  topics: DigestTopicDraft[];
  disabled: boolean;
}

// "+" 추가 버튼에만 relative + before:(inset-y-0 left-0 -right-10)로 여유
// 히트박스를 얹는다 — 보이는 크기(작은 원)는 안 건드리고, 빈 ::before 가상
// 요소로 우측으로만 40px 확장한다(사방으로 넓히면 gap-1로 붙어 있는 아래 타입·
// 제목 행과 겹칠 수 있어서 위아래는 안 건드림). Topic 텍스트가 이미 있는 경우는
// 클릭 정밀도 문제가 덜해 히트박스 확장을 따로 안 얹는다.
// self-start를 안 쓰는 이유 — 지금 부모(DigestCardHeader의 Topic·액션 행)가
// items-center로 세로 중앙 정렬을 이미 맡고 있어서, self-start를 두면 그 정렬을
// 무시하고 위쪽에 고정돼버린다.
//
// 평소엔 조용한 브레드크럼 텍스트, 클릭하면 팝오버 안에서 TopicEditPanel(추가·
// 삭제)이 나타난다 — 편집 UI 자체는 안 바꾸고 노출 시점만 상시 → 클릭 시로
// 옮긴다. Topic이 0개면 브레드크럼 텍스트 자체가 없어 추가할 진입점이 사라지므로,
// outline 톤의 원형 "+" 자리를 대신 보여준다 — 조용한 텍스트가 아니라 눈에 띄는
// 모양인 이유는, 채워진 값과 달리 "여기 추가할 수 있다"는 발견성이 필요해서다.
// weave Chip을 그대로 못 쓰는 이유는 Chip 자신이 곧 button이라, 넓은 히트박스용
// 바깥 button 안에 중첩 button을 못 넣기 때문 — 시각만 같은 span으로 대체하고
// hover는 group-hover로 옮긴다.
export function DigestTopicPicker({
  digestId,
  topics,
  disabled,
}: DigestTopicPickerProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();

  return (
    <Popover>
      <PopoverTrigger asChild>
        {topics.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            className="-mb-px flex cursor-pointer items-center gap-1 border-b border-transparent text-left text-fg-primary hover:border-current data-[state=open]:border-current disabled:pointer-events-none disabled:opacity-50"
          >
            {/* color를 제목·본문 값과 같은 primary로 맞춘다 — 굵기·크기는 그대로
                둬서 위계는 유지하되, 눈에 덜 띄던 tertiary 대비 가독성만 올린다.
                구분자는 텍스트 글리프 "·" 대신 본문 리스트 불릿(DigestListField)과
                같은 Circle+fill-current — 12px에서 "·"는 잉크가 너무 적어 안 보인다.
                hover 밑줄은 text-decoration이 아니라 border-b — flex 자식(각 주제
                span·Circle)마다 데코레이션이 끊겨 그려지는 문제가 있어, 버튼 전체에
                거는 border로 바꿔 Circle 사이 여백까지 하나로 이어지게 한다. -mb-px는
                그 border가 늘린 박스 높이 1px을 상쇄해, Type Chip·미트볼과 나란히
                items-center로 놓였을 때 이 버튼만 미세하게 떠 보이지 않게 한다. */}
            {topics.map((topic, index) => (
              <span
                key={topic.id ?? `draft-${index}`}
                className="flex items-center gap-1"
              >
                {index > 0 && (
                  <Circle className="size-1 shrink-0 fill-current" />
                )}
                {/* 신규(draft, id === null) 표식은 개체 왼쪽 — NewReferenceIndicator가
                    쓰는 배치를 따른다. 간격을 아예 안 둬(gap-0) "+"가 라벨 글자에
                    바로 붙은 prefix처럼 보이게 한다 — Circle 구분자와의 간격(gap-1)과
                    대비되는 지점이라 여기만 0이어야 구분이 산다. */}
                <span className="flex items-center gap-0">
                  {topic.id === null && <NewLabelIndicator />}
                  <Text as="span" size="xs" color="primary">
                    {topic.title}
                  </Text>
                </span>
              </span>
            ))}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-label={t("review.topic_add_action")}
            className="group relative inline-flex before:absolute before:inset-y-0 before:left-0 before:-right-10 before:content-[''] disabled:pointer-events-none disabled:opacity-50"
          >
            <span
              className={cn(
                OUTLINE_TONE_CLASSNAME,
                "inline-flex size-5 items-center justify-center rounded-full border-dashed transition-colors group-hover:bg-fg-primary/5 group-data-[state=open]:bg-fg-primary/5",
              )}
            >
              <Plus className="size-3" />
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={-24} className="p-0">
        <TopicEditPanel
          topics={topics}
          disabled={disabled}
          onChange={(next) =>
            dispatch({
              type: "digest/setTopics",
              id: digestId,
              topics: next,
            })
          }
        />
      </PopoverContent>
    </Popover>
  );
}
