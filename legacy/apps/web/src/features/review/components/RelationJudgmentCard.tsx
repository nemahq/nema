import { cn } from "@nema-io/weave";
import { Check } from "@nema-io/weave/icons";

import type { DigestBodyFieldKey } from "@web/features/review/constants";
import type { DigestDetailSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestReadonlyCard } from "./DigestReadonlyCard";
import { DigestSourceButton } from "./DigestSourceButton";

interface RelationJudgmentCardProps {
  digest: DigestDetailSnapshot;
  highlightedFieldKey?: DigestBodyFieldKey;
  highlightedFieldIndex?: number;
  selected: boolean;
  onSelect: () => void;
  sourceActive: boolean;
  onViewSource: () => void;
  disabled?: boolean;
}

// 관계 판정 화면의 A·B 카드 — DigestReadonlyCard(순수 표시 컴포넌트, 판정을 모름)는
// 그대로 두고, 그 바깥에 판정 전용 인터랙션(카드 클릭 선택+체크 배지, 원문에서 보기)만
// 얹는다. 선택 버튼을 카드 전체를 덮는 절대배치 <button>으로 깔고 그 위에 내용을
// z-index로 얹는 방식이라("원문에서 보기"는 더 높은 z), 버튼을 서로 중첩하지 않고도
// (button 안에 button 금지) 클릭 대상이 자연히 갈린다 — stopPropagation이 필요 없다.
export function RelationJudgmentCard({
  digest,
  highlightedFieldKey,
  highlightedFieldIndex,
  selected,
  onSelect,
  sourceActive,
  onViewSource,
  disabled = false,
}: RelationJudgmentCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 p-1 transition-colors",
        selected
          ? "border-brand-accent bg-brand-tint"
          : "border-transparent hover:border-border",
      )}
    >
      {/* weave Button 대신 raw button — 카드 전체를 덮는 투명 클릭 영역이라
          라벨·아이콘이 없고, Button의 base(text-[13px] font-semibold, padding,
          variant 배경색)를 전부 되돌려야 해서 원칙(docs/guides/weave-usage.md)의
          "되돌리는 비용이 얻는 것보다 클 때" 케이스에 해당한다. */}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        aria-label={t("review.relation_judgment_select_card", {
          title: digest.title,
        })}
        onClick={onSelect}
        className={cn(
          "absolute inset-0 z-10 h-full w-full rounded-lg",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      />
      {selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-2 -top-2 z-10 inline-flex size-5 items-center justify-center rounded-full bg-fg-primary text-surface-base"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      <DigestReadonlyCard
        digest={digest}
        highlightedFieldKey={highlightedFieldKey}
        highlightedFieldIndex={highlightedFieldIndex}
      />
      <div className="absolute top-3 right-3 z-20">
        <DigestSourceButton
          active={sourceActive}
          disabled={disabled}
          onClick={onViewSource}
        />
      </div>
    </div>
  );
}
