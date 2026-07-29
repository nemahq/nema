import type { ReviewTagDraft } from "@nema-io/shared";
import {
  Badge,
  PopoverContent,
  PopoverTrigger,
  TAG_COLOR_CLASSNAME,
  Text,
} from "@nema-io/weave";
import { Tag as TagIcon } from "@nema-io/weave/icons";

import { Popover } from "@web/components/ui/Popover";
import { useTranslation } from "@web/lib/tolgee";

import { NewLabelIndicator } from "./NewLabelIndicator";
import { useReviewDraftContext } from "./ReviewDraftProvider";
import { TagEditPanel } from "./TagEditPanel";

interface DigestTagPickerProps {
  digestId: string;
  tags: ReviewTagDraft[];
  disabled: boolean;
}

// 칩은 바깥 화면에선 읽기 전용이다 — 추가·제거는 전부 TagEditPanel 안에서만
// 일어난다(Topic과 같은 원칙). hover 배경 틴트는 Topic의 hover 밑줄과 같은
// 신호지만, 칩이 여러 개 나란히 있을 땐 밑줄 하나로 "행 전체"라는 범위가 안
// 읽혀서 배경으로 바꿨다.
//
// 트리거는 0개·1개 이상 상관없이 항상 같은 하나의 button — 안의 내용(아이콘+
// 텍스트 vs 칩들)만 갈아끼운다. 두 상태를 서로 다른 요소(weave Button vs raw
// button)로 나눴다가, 팝오버를 열어둔 채 태그를 추가하면(0→1) 트리거 자신의
// 마진·박스가 바뀌면서 Radix가 앵커를 다시 계산해 팝오버가 살짝 움직이는
// 문제가 있었다 — 바깥 박스는 상태와 무관하게 고정해 앵커 좌표가 안 흔들리게
// 한다.
//
// 패딩은 이 button 하나에만 준다(px-2=본문 필드 pl-2와 같은 값, py-1). 예전엔
// 상태마다 따로 보정하려고 음수 마진(-ml-2)+빈 상태 span의 pl-2를 같이 썼는데,
// 그 둘이 겹쳐 빈 상태만 왼쪽 패딩이 두 배로 쌓이는 비대칭이 났다 — 트리거를
// 감싸는 컨테이너 하나에 고정 패딩만 주고 안쪽(Badge·아이콘)엔 더 손대지 않는
// 지금 방식이 상태와 무관하게 항상 같다.
export function DigestTagPicker({
  digestId,
  tags,
  disabled,
}: DigestTagPickerProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  // DigestTopicPicker와 같은 이유(그 파일 주석 참고) — 신규 먼저, 그룹 내부는
  // 원래 순서 유지.
  const sortedTags = [...tags].sort(
    (a, b) => (a.registryId === null ? 0 : 1) - (b.registryId === null ? 0 : 1),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-7 cursor-pointer flex-wrap items-center gap-1 rounded-md px-2 py-1 text-left hover:bg-surface-raised-hover/75 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-surface-raised-hover"
        >
          {tags.length > 0 ? (
            sortedTags.map((tag) => (
              // h-5 고정 — leading-[1.4] 같은 소수점 line-height는 중첩 레벨마다
              // (Badge inline-block vs 이 span flex) 브라우저가 서브픽셀을 다르게
              // 반올림해 빈 상태와 정확히 안 맞을 수 있다. 정수 픽셀 높이로
              // 고정해야 아래 빈 상태 span과 흔들림 없이 완전히 같아진다.
              <span
                key={tag.id}
                className="inline-flex h-5 min-w-0 items-center gap-0"
              >
                {tag.registryId === null && <NewLabelIndicator />}
                {/* variant/color 대신 className — Badge의 BadgeColor(5색, 뜻
                    모르는 분류용)는 Tag의 TagColor(8색 파스텔 팔레트)와 다른
                    축이라 안 맞는다. Chip은 nested <button>이 되어 이 트리거
                    자신의 <button> 안에 못 들어가 못 쓴다. */}
                <Badge
                  shape="rounded"
                  truncated
                  className={TAG_COLOR_CLASSNAME[tag.color]}
                >
                  {tag.title}
                </Badge>
              </span>
            ))
          ) : (
            <span className="flex h-5 items-center gap-1 text-fg-tertiary">
              <TagIcon className="size-3" />
              <Text as="span" size="xs" color="tertiary">
                {t("review.tag_add_action")}
              </Text>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={-34} className="p-0">
        <TagEditPanel
          tags={tags}
          disabled={disabled}
          onChange={(next) =>
            dispatch({ type: "digest/setTags", id: digestId, tags: next })
          }
        />
      </PopoverContent>
    </Popover>
  );
}
