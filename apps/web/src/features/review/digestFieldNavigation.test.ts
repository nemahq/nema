import { afterEach, describe, expect, it, vi } from "vitest";

import { handleBoundaryArrowKeyDown } from "./digestFieldNavigation";

function addField({
  value = "",
  disabled = false,
}: { value?: string; disabled?: boolean } = {}) {
  const el = document.createElement("textarea");
  el.setAttribute("data-nav-field", "");
  el.value = value;
  el.disabled = disabled;
  document.body.appendChild(el);
  return el;
}

function keyDown(
  target: HTMLTextAreaElement,
  key: "ArrowUp" | "ArrowDown",
  { shiftKey = false }: { shiftKey?: boolean } = {},
) {
  const preventDefault = vi.fn();
  const event = {
    key,
    shiftKey,
    currentTarget: target,
    preventDefault,
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
  const handled = handleBoundaryArrowKeyDown(event);
  return { handled, preventDefault };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("handleBoundaryArrowKeyDown", () => {
  it("커서가 필드 맨 끝일 때 ArrowDown을 누르면 다음 필드로 옮겨가고 커서는 맨 앞에 놓인다", () => {
    const first = addField({ value: "abc" });
    const second = addField({ value: "def" });
    first.focus();
    first.setSelectionRange(3, 3);

    const { handled, preventDefault } = keyDown(first, "ArrowDown");

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(second);
    expect(second.selectionStart).toBe(0);
  });

  it("커서가 필드 맨 앞일 때 ArrowUp을 누르면 이전 필드로 옮겨가고 커서는 맨 끝에 놓인다", () => {
    const first = addField({ value: "abc" });
    const second = addField({ value: "def" });
    second.focus();
    second.setSelectionRange(0, 0);

    const { handled } = keyDown(second, "ArrowUp");

    expect(handled).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(first.selectionStart).toBe(3);
  });

  it("줄 중간에 커서가 있으면 가로채지 않는다 — 브라우저 기본 동작(같은 줄 안 이동)에 맡긴다", () => {
    const first = addField({ value: "abc" });
    addField({ value: "def" });
    first.focus();
    first.setSelectionRange(1, 1);

    const { handled, preventDefault } = keyDown(first, "ArrowDown");

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
  });

  it("Shift+화살표(선택 확장 중)는 항상 가로채지 않는다", () => {
    const first = addField({ value: "abc" });
    addField({ value: "def" });
    first.focus();
    first.setSelectionRange(3, 3);

    const { handled } = keyDown(first, "ArrowDown", { shiftKey: true });

    expect(handled).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it("접혀서 disabled된 필드는 순회 대상에서 빠지고 다음으로 보이는 필드로 옮겨간다", () => {
    const first = addField({ value: "abc" });
    addField({ value: "hidden", disabled: true });
    const third = addField({ value: "ghi" });
    first.focus();
    first.setSelectionRange(3, 3);

    const { handled } = keyDown(first, "ArrowDown");

    expect(handled).toBe(true);
    expect(document.activeElement).toBe(third);
  });

  it("맨 앞 필드에서 ArrowUp을 누르면 키는 가로채지만 이동할 곳이 없어 포커스는 그대로다", () => {
    const first = addField({ value: "abc" });
    first.focus();
    first.setSelectionRange(0, 0);

    const { handled, preventDefault } = keyDown(first, "ArrowUp");

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
  });
});
