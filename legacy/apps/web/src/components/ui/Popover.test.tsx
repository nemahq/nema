import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";

import {
  ActionRegistryProvider,
  useActionRegistry,
} from "@web/lib/command/shortcut/context";

import { Popover } from "./Popover";

type Registry = ReturnType<typeof useActionRegistry>;

interface HarnessProps {
  onReady: (registry: Registry) => void;
}

// TagAddPopover가 겪은 경로를 그대로 재현한다 — 팝오버 자신이 성공 콜백에서
// Radix onOpenChange를 거치지 않고 open prop을 직접 false로 내린다.
function ControlledHarness({ onReady }: HarnessProps) {
  const [open, setOpen] = useState(true);
  const registry = useActionRegistry();
  onReady(registry);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(false)}>
        close-without-onOpenChange
      </button>
    </Popover>
  );
}

describe("Popover", () => {
  it("controlled open을 바깥에서 직접 false로 바꿔도 오버레이 가드가 풀린다", () => {
    let registry: Registry | undefined;
    const { getByText } = render(
      <ActionRegistryProvider>
        <ControlledHarness onReady={(r) => (registry = r)} />
      </ActionRegistryProvider>,
    );

    expect(registry?.isOverlayOpen()).toBe(true);

    act(() => {
      getByText("close-without-onOpenChange").click();
    });

    expect(registry?.isOverlayOpen()).toBe(false);
  });
});
