import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface DigestSourceButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

// 원문 보기는 리뷰 작업의 핵심(원문 대조)이라 ⋯ 뒤에 숨기지 않는다. 아이콘이 텍스트
// 없이 혼자 의미를 전달해야 해서, 이 앱이 이미 "문서" 의미로 쓰는 FileText를
// 재사용한다 — Search는 같은 앱에서 "검색 쿼리"라는 다른 뜻으로 이미 쓰인다.
export function DigestSourceButton({
  active,
  disabled,
  onClick,
}: DigestSourceButtonProps) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled}
          aria-label={t("review.digest_view_source_action")}
          onClick={onClick}
          // shadow가 아니라 border, shape도 circle이 아니라 기본(rounded-md) —
          // 바로 옆 CardViewedToggle(읽음 체크박스)이 같은 rounded-md +
          // border-border-strong 박스라, 이 버튼도 그 모양 그대로 맞춰야 두
          // 액션이 같은 시각적 무게로 읽힌다. size="xs"의 고정 h-6은 border를
          // 안쪽으로 먹어 CardViewedToggle(패딩 위에 테두리를 더하는 auto
          // height)보다 살짝 낮아지므로, h-auto+py-1로 같은 계산식을 맞춘다.
          className={cn(
            "h-auto border border-border-strong py-1 text-fg-tertiary",
            active && "bg-fg-primary/10 text-fg-primary",
          )}
        >
          <FileText className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t("review.digest_view_source_action")}
      </TooltipContent>
    </Tooltip>
  );
}
