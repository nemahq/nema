import { cn } from "@nema-io/weave";

import { useTypewriter } from "@web/hooks/useTypewriter";
import { useTranslation } from "@web/lib/tolgee";

interface DraftTitleProps {
  title: string | null;
  className?: string;
  // 상세 패널처럼 제목 영역이 고정 레이아웃이어야 하는 곳에서만 true — 리스트
  // 아이템은 기본값(false)대로 제목이 없으면 영역 자체를 안 보여준다.
  showPlaceholder?: boolean;
}

// SessionItem의 제목 자동생성 처리(useTypewriter)와 같은 관례를 따른다.
export function DraftTitle({
  title,
  className,
  showPlaceholder = false,
}: DraftTitleProps) {
  const { t } = useTranslation();
  const animatedTitle = useTypewriter(title);

  if (!animatedTitle) {
    if (!showPlaceholder) {
      return null;
    }
    return (
      <span className={cn(className, "text-fg-tertiary")}>
        {t("intake.draft_untitled")}
      </span>
    );
  }

  return <span className={className}>{animatedTitle}</span>;
}
