import { cn } from "../utils";

interface LoadingGuardProps {
  active: boolean;
  className?: string;
}

// 어떤 액션이 진행 중인 동안 그 아래 콘텐츠를 옅게 dim 처리하고 클릭만 막는
// 자리 — 완전히 가리지 않는다(콘텐츠가 계속 읽혀야 한다는 게 이 컴포넌트의
// 전제). 스피너는 안 그린다 — "뭘 하고 있는지"는 트리거 쪽 텍스트가 이미
// 말해주고, 여긴 그 사이 클릭을 막는 보조 역할만 맡는다. 같은 액션 안에서
// 개별 필드의 disabled와 항상 같은 시점에 켜지는 자리라, 여기만 fade로
// 늦게 따라붙으면 어긋나 보인다 — 그래서 애니메이션 없이 즉시 전환한다.
// 덮는 대상 위에 `relative`를 걸고 그 안에 형제로 넣어 쓴다
// (`absolute inset-0`가 그 기준을 잡는다).
export function LoadingGuard({ active, className }: LoadingGuardProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-20 bg-surface-base/35 opacity-0",
        active && "pointer-events-auto opacity-100",
        className,
      )}
    />
  );
}
