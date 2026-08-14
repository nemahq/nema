import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { useMainScrollRestoration } from "./useMainScrollRestoration";

interface ScrollAreaProps {
  scrollKey: string;
}

function ScrollArea({ scrollKey }: ScrollAreaProps) {
  const ref = useMainScrollRestoration(scrollKey);
  return <div ref={ref} data-testid="scroll-area" />;
}

function getScrollArea(container: HTMLElement) {
  const element = container.querySelector('[data-testid="scroll-area"]');
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("scroll-area not found");
  }
  return element;
}

describe("useMainScrollRestoration", () => {
  it("다른 key로 마운트하면 이전 스크롤 위치를 물려받지 않는다", () => {
    const first = render(<ScrollArea scrollKey="digest-list-a" />);
    const firstArea = getScrollArea(first.container);
    firstArea.scrollTop = 120;
    firstArea.dispatchEvent(new Event("scroll"));
    first.unmount();

    const second = render(<ScrollArea scrollKey="digest-list-b" />);
    expect(getScrollArea(second.container).scrollTop).toBe(0);
  });

  it("같은 key로 재마운트하면 이전 스크롤 위치를 복원한다", () => {
    const first = render(<ScrollArea scrollKey="digest-list-c" />);
    const firstArea = getScrollArea(first.container);
    firstArea.scrollTop = 80;
    firstArea.dispatchEvent(new Event("scroll"));
    first.unmount();

    const second = render(<ScrollArea scrollKey="digest-list-c" />);
    expect(getScrollArea(second.container).scrollTop).toBe(80);
  });

  it("scroll 이벤트 없이 바뀐 위치도 언마운트 시 저장한다", () => {
    const first = render(<ScrollArea scrollKey="digest-list-d" />);
    getScrollArea(first.container).scrollTop = 40;
    first.unmount();

    const second = render(<ScrollArea scrollKey="digest-list-d" />);
    expect(getScrollArea(second.container).scrollTop).toBe(40);
  });
});
