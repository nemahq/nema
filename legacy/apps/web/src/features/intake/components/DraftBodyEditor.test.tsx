import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// blur가 이미 쏜 저장 요청을 handleRegenerate가 다시 쏘지 않고 기다리는지가
// 이 PR이 고친 버그의 유일한 안전장치라, 여기서 그 회귀만 검증한다. trpc/queryClient
// 전체를 띄우는 대신 이 컴포넌트가 직접 쓰는 두 훅만 모킹한다.
const updateBodyMutateAsync = vi.fn();
const startDigestionMutateAsync = vi.fn();

vi.mock("@web/lib/tolgee", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@web/lib/command/shortcut/useRegisterAction", () => ({
  useRegisterAction: () => ({ isShortcutOverridden: false }),
}));

vi.mock("@web/features/intake/hooks/useUpdateSourceBody", () => ({
  useUpdateSourceBody: () => ({
    mutateAsync: updateBodyMutateAsync,
    isError: false,
  }),
}));

vi.mock("@web/features/intake/hooks/useStartSourceDigestion", () => ({
  useStartSourceDigestion: () => ({
    mutateAsync: startDigestionMutateAsync,
  }),
}));

const { DraftBodyEditor } = await import("./DraftBodyEditor");

afterEach(() => {
  cleanup();
  updateBodyMutateAsync.mockReset();
  startDigestionMutateAsync.mockReset();
});

function renderEditor() {
  return render(
    <DraftBodyEditor
      sourceId="source-1"
      initialBody="원래 본문"
      status="failed"
      inputChangedSinceDigestion={false}
      onStartingDigestionChange={() => {}}
      isStartingDigestion={false}
    />,
  );
}

describe("DraftBodyEditor", () => {
  it("blur 직후 바로 기억하기를 눌러도 본문 저장 요청이 한 번만 나간다", async () => {
    let resolveSave: (value: { draftVersion: number }) => void = () => {};
    updateBodyMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    startDigestionMutateAsync.mockResolvedValue(undefined);

    renderEditor();
    const textarea = screen.getByPlaceholderText(
      "intake.compose_body_placeholder",
    );

    fireEvent.change(textarea, { target: { value: "고친 본문" } });
    fireEvent.blur(textarea);
    fireEvent.click(screen.getByText("intake.remember"));

    expect(updateBodyMutateAsync).toHaveBeenCalledTimes(1);

    resolveSave({ draftVersion: 1 });
    await Promise.resolve();

    expect(updateBodyMutateAsync).toHaveBeenCalledTimes(1);
  });
});
