export type DraftsNavItemRenderState =
  | "hidden"
  | "entering"
  | "visible"
  | "exiting";

interface RenderTransitionInput {
  isVisible: boolean;
  wasVisible: boolean;
  hadLoadedBefore: boolean;
}

interface RenderTransition {
  state: DraftsNavItemRenderState;
  // true면 TRANSITION_ANIMATION_MS 뒤 settledState로 다시 전이해야 한다.
  animated: boolean;
  settledState: DraftsNavItemRenderState;
}

// 초안 노출 여부가 바뀔 때 어떤 렌더 상태로 갈지 결정하는 순수 판단부만 분리했다 —
// 새로고침 시 응답이 늦게 와서 기존 초안이 뒤늦게 드러나는 걸 "방금 생김"으로
// 오인해 진입 애니메이션을 잘못 재생하던 legacy 리그레션이 바로 이 판단 하나에
// 달려 있다: hadLoadedBefore가 false인 시점(첫 로드가 아직 끝난 적 없음)이면
// isVisible이 true라도 애니메이션 없이 바로 visible로 간다.
export function nextDraftsNavItemRenderState({
  isVisible,
  wasVisible,
  hadLoadedBefore,
}: RenderTransitionInput): RenderTransition {
  if (isVisible) {
    if (!hadLoadedBefore || wasVisible) {
      return { state: "visible", animated: false, settledState: "visible" };
    }
    return { state: "entering", animated: true, settledState: "visible" };
  }
  if (!wasVisible) {
    return { state: "hidden", animated: false, settledState: "hidden" };
  }
  return { state: "exiting", animated: true, settledState: "hidden" };
}
