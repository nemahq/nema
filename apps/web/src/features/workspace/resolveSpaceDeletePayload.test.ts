import { describe, expect, it } from "vitest";

import {
  DELETE_PENDING_DRAFTS_OPTION,
  resolveSpaceDeletePayload,
} from "./resolveSpaceDeletePayload";

describe("resolveSpaceDeletePayload", () => {
  it("대기 초안이 없으면 두 파라미터 모두 안 보낸다", () => {
    expect(resolveSpaceDeletePayload(0, "space-b")).toEqual({
      targetSpaceId: undefined,
      deletePendingDrafts: undefined,
    });
  });

  it("이동 대상 Space id를 고르면 targetSpaceId만 보낸다", () => {
    expect(resolveSpaceDeletePayload(3, "space-b")).toEqual({
      targetSpaceId: "space-b",
      deletePendingDrafts: undefined,
    });
  });

  it("'함께 삭제'를 고르면 deletePendingDrafts만 보낸다", () => {
    expect(resolveSpaceDeletePayload(3, DELETE_PENDING_DRAFTS_OPTION)).toEqual({
      targetSpaceId: undefined,
      deletePendingDrafts: true,
    });
  });

  it("대기 초안이 있는데 아무것도 안 골랐으면(draftDisposition undefined) targetSpaceId도 undefined", () => {
    expect(resolveSpaceDeletePayload(3, undefined)).toEqual({
      targetSpaceId: undefined,
      deletePendingDrafts: undefined,
    });
  });
});
