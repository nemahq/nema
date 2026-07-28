import type { TranslationKey } from "@web/lib/tolgee";

// global: 오버레이(Dialog/DropdownMenu/Popover/Select)가 하나라도 열려있으면
// 자동으로 양보(useRegisterAction 참고).
// modal: 이 양보 규칙에서 제외 — 오버레이 자신의 단축키가 스스로를 막으면 안 된다.
export type ActionScope = "global" | "modal";

export interface ActionDef {
  labelKey: TranslationKey;
  shortcut: string;
  scope: ActionScope;
  priority: number;
  // mod+z류가 텍스트 입력 안에서도 기본으로 폼 태그를 허용해온 이유는 mod+enter
  // 같은 조합이 타이핑 중에도 눌려야 하기 때문이다 — 하지만 브라우저 네이티브
  // 텍스트 실행취소와 같은 키를 쓰는 액션은 그 우선순위를 거꾸로 둬야 한다:
  // 입력 필드 안에서는 네이티브 동작에 양보하고(false), 필드 밖에서만 이 앱
  // 단축키가 잡는다.
  enableOnFormTags: boolean;
}
