import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";

import { ActionRegistryProvider } from "@web/lib/command/shortcut/context";

import { DropdownMenu } from "./DropdownMenu";

// weave DropdownMenuItem이 쓰는 useIsOverflowing이 필요로 함 — jsdom엔 기본
// 구현이 없다.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver;

// #554의 회귀 가드 — DropdownMenu의 modal 기본값이 false로 유지되는지(그리고
// modal prop을 명시하면 여전히 우선하는지)만 확인한다. #554가 고친 실제 레이스
// (다른 non-modal 오버레이가 안 닫히는 문제, weave/DropdownMenu.tsx의 주석
// 참고)는 sibling 오버레이·실제 브라우저 이벤트 타이밍을 요구해 jsdom으로는
// 재현되지 않는다 — 이 테스트는 그 레이스 자체가 아니라 "modal 하드코딩 실수"
// 같은 회귀만 잡아낸다.
describe("DropdownMenu", () => {
  it("기본값(modal 미지정)으로 열려도 body pointer-events를 잠그지 않는다", async () => {
    render(
      <ActionRegistryProvider>
        <DropdownMenu open>
          <DropdownMenuTrigger>trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionRegistryProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("modal을 명시적으로 켜면 여전히 body pointer-events를 잠근다", async () => {
    render(
      <ActionRegistryProvider>
        <DropdownMenu open modal>
          <DropdownMenuTrigger>trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionRegistryProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(document.body.style.pointerEvents).toBe("none");
  });
});
