import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// 이 폼의 유일한 계약은 "저장 버튼 없이, 팝오버가 닫힐 때(언마운트)만 이름·설명이
// 커밋되고 색은 고른 즉시 반영된다"는 것 — 타이핑 중이나 빈 값으로 닫았을 때 조용히
// 커밋돼버리면 D5 스펙 위반이라 여기서 그 경계만 검증한다.
vi.mock("@web/lib/tolgee", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { TagDraftRenameForm } = await import("./TagDraftRenameForm");

afterEach(() => {
  cleanup();
});

function renderForm() {
  const onCommitText = vi.fn();
  const onColorChange = vi.fn();
  const { unmount } = render(
    <TagDraftRenameForm
      title="기존 이름"
      description="기존 설명"
      color="slate"
      isDuplicateTitle={() => false}
      onCommitText={onCommitText}
      onColorChange={onColorChange}
    />,
  );
  return { onCommitText, onColorChange, unmount };
}

describe("TagDraftRenameForm", () => {
  it("타이핑 중에는 커밋되지 않고, 팝오버가 닫힐 때(언마운트)만 커밋된다", () => {
    const { onCommitText, unmount } = renderForm();

    fireEvent.change(screen.getByLabelText("common.name_label"), {
      target: { value: "새 이름" },
    });
    expect(onCommitText).not.toHaveBeenCalled();

    unmount();
    expect(onCommitText).toHaveBeenCalledWith("새 이름", "기존 설명");
  });

  it("빈 이름으로 닫으면 커밋하지 않는다", () => {
    const { onCommitText, unmount } = renderForm();

    fireEvent.change(screen.getByLabelText("common.name_label"), {
      target: { value: "" },
    });
    unmount();

    expect(onCommitText).not.toHaveBeenCalled();
  });

  it("색상은 선택 즉시 반영되고 언마운트를 기다리지 않는다", () => {
    const { onColorChange } = renderForm();

    fireEvent.click(screen.getByText("review.tag_color_cyan"));

    expect(onColorChange).toHaveBeenCalledWith("cyan");
  });
});
