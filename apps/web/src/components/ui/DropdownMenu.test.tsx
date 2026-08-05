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

// DropdownMenu가 열려 있는 동안 sibling Popover(비-modal)의 바깥-클릭 판정을
// 막지 않는지를 검증한다 — Radix DropdownMenu 기본값(modal: true)은 열리는
// 즉시 document.body.style.pointerEvents를 "none"으로 바꿔 다른 비-modal
// 레이어의 outside-click 판정을 억제한다. 이 억제가, 이미 열려 있던 다른
// 비-modal 팝오버를 트리거 클릭 한 번으로 여는 바로 그 클릭에 걸리면(같은
// 클릭이 "새로 열리는 모달" 등록과 "예전 레이어의 outside 판정"을 함께
// 처리) 예전 레이어가 안 닫히는 실제 버그로 이어진다(리뷰 화면 Digest
// 카드에서 재현, staging에서 확인). weave DropdownMenu는 이 클래스의
// 레이스를 구조적으로 없애기 위해 기본값을 non-modal로 뒤집는다.
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
