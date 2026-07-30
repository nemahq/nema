import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// TagDraftRenameForm.test.tsx와 같은 계약, 색상이 없는 버전 — 저장 버튼 없이
// 팝오버가 닫힐 때(언마운트)만, 그리고 실제로 바뀐 값일 때만 커밋된다.
vi.mock("@web/lib/tolgee", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { TopicDraftRenameForm } = await import("./TopicDraftRenameForm");

afterEach(() => {
  cleanup();
});

function renderForm() {
  const onCommitText = vi.fn();
  const { unmount } = render(
    <TopicDraftRenameForm
      title="기존 이름"
      isDuplicateTitle={() => false}
      onCommitText={onCommitText}
    />,
  );
  return { onCommitText, unmount };
}

describe("TopicDraftRenameForm", () => {
  it("타이핑 중에는 커밋되지 않고, 팝오버가 닫힐 때(언마운트)만 커밋된다", () => {
    const { onCommitText, unmount } = renderForm();

    fireEvent.change(screen.getByLabelText("common.name_label"), {
      target: { value: "새 이름" },
    });
    expect(onCommitText).not.toHaveBeenCalled();

    unmount();
    expect(onCommitText).toHaveBeenCalledWith("새 이름");
  });

  it("아무것도 바꾸지 않고 닫으면 커밋하지 않는다", () => {
    const { onCommitText, unmount } = renderForm();

    unmount();

    expect(onCommitText).not.toHaveBeenCalled();
  });

  it("빈 이름으로 닫으면 커밋하지 않는다", () => {
    const { onCommitText, unmount } = renderForm();

    fireEvent.change(screen.getByLabelText("common.name_label"), {
      target: { value: "" },
    });
    unmount();

    expect(onCommitText).not.toHaveBeenCalled();
  });

  it("중복 이름으로 닫으면 커밋하지 않는다", () => {
    const onCommitText = vi.fn();
    const { unmount } = render(
      <TopicDraftRenameForm
        title="기존 이름"
        isDuplicateTitle={(title) => title === "중복 이름"}
        onCommitText={onCommitText}
      />,
    );

    fireEvent.change(screen.getByLabelText("common.name_label"), {
      target: { value: "중복 이름" },
    });
    unmount();

    expect(onCommitText).not.toHaveBeenCalled();
  });
});
