import { Button } from "@nema-io/weave";
import { BellIcon } from "@nema-io/weave/icons";

interface NotificationSoftAskToastProps {
  message: string;
  allowLabel: string;
  dismissLabel: string;
  onAllow: () => void;
  onDismiss: () => void;
}

// toast.custom()으로 렌더링되면 sonner의 기본 배경·패딩·radius가 안 붙는다
// (data-styled=false) — 그래서 이 컴포넌트가 chrome을 직접 그린다. weave
// Toast.tsx와 같은 다크 톤 팔레트 토큰을 그대로 참조해 다른 토스트와 톤을
// 맞춘다.
export function NotificationSoftAskToast({
  message,
  allowLabel,
  dismissLabel,
  onAllow,
  onDismiss,
}: NotificationSoftAskToastProps) {
  return (
    <div className="flex w-full items-start gap-3 rounded-xl bg-(--palette-dark-surface-raised-hover) p-4 text-(--palette-dark-fg-primary) shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
      <BellIcon className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1 text-sm">{message}</p>
      <div className="flex shrink-0 flex-col gap-1">
        <Button size="sm" onClick={onAllow}>
          {allowLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {dismissLabel}
        </Button>
      </div>
    </div>
  );
}
