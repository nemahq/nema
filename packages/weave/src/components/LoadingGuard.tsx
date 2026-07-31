import { cn } from "../utils";

interface LoadingGuardProps {
  active: boolean;
  className?: string;
}

// 어떤 액션이 진행 중인 동안 그 아래 콘텐츠를 옅게 dim 처리하고 클릭만 막는
// 자리 — 완전히 가리지 않는다(콘텐츠가 계속 읽혀야 한다는 게 이 컴포넌트의
// 전제). 스피너는 안 그린다 — "뭘 하고 있는지"는 트리거 쪽 텍스트가 이미
// 말해주고, 여긴 그 사이 클릭을 막는 보조 역할만 맡는다. active와 무관하게
// 항상 마운트해 opacity·pointer-events만 전환한다 — 마운트/언마운트를 타이밍에
// 맞춰 조율할 필요 없이 등장·소멸 둘 다 자연스럽게 fade된다. 덮는 대상 위에
// `relative`를 걸고 그 안에 형제로 넣어 쓴다(`absolute inset-0`가 그 기준을 잡는다).
export function LoadingGuard({ active, className }: LoadingGuardProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-20 bg-surface-base/70 opacity-0 transition-opacity duration-normal",
        active && "pointer-events-auto opacity-100",
        className,
      )}
    />
  );
}
