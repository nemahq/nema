import { describe, expect, it } from "vitest";

import { getWorkspaceAvatarColorClass } from "./workspaceAvatarColor";

describe("getWorkspaceAvatarColorClass", () => {
  it("같은 workspaceId면 항상 같은 색을 반환한다", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(getWorkspaceAvatarColorClass(id)).toBe(
      getWorkspaceAvatarColorClass(id),
    );
  });

  it("항상 bg-identity- 접두사 클래스를 반환한다", () => {
    const ids = [
      "a",
      "workspace-1",
      "11111111-1111-1111-1111-111111111111",
      "",
    ];
    for (const id of ids) {
      expect(getWorkspaceAvatarColorClass(id)).toMatch(/^bg-identity-/);
    }
  });
});
