import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { invalidateUnlessFresh } from "./invalidateUnlessFresh";

const KEY = ["realtime-test", "single"];
const KEY_A = ["realtime-test", "multi-a"];
const KEY_B = ["realtime-test", "multi-b"];

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
});

describe("invalidateUnlessFresh", () => {
  it("이 변경(changedAt)보다 캐시가 이미 최신이면 재조회를 건너뛴다", async () => {
    const now = Date.now();
    client.setQueryData(KEY, "data", { updatedAt: now });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await invalidateUnlessFresh(
      client,
      KEY,
      new Date(now - 10_000).toISOString(),
    );

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("캐시가 이 변경보다 오래됐으면(디바운스로 지연된 flush가 최신 변경을 대변하는 경우 포함) 재조회한다", async () => {
    const now = Date.now();
    client.setQueryData(KEY, "data", { updatedAt: now });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await invalidateUnlessFresh(
      client,
      KEY,
      new Date(now + 10_000).toISOString(),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("캐시에 아무 인스턴스도 없으면(마운트 안 됨) 재조회를 시도한다", async () => {
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await invalidateUnlessFresh(client, KEY, new Date().toISOString());

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("prefix 키에 걸리는 인스턴스가 여럿일 때, 하나라도 오래됐으면 건너뛰지 않는다", async () => {
    const now = Date.now();
    client.setQueryData(KEY_A, "fresh", { updatedAt: now });
    client.setQueryData(KEY_B, "stale", { updatedAt: now - 20_000 });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await invalidateUnlessFresh(
      client,
      ["realtime-test"],
      new Date(now - 10_000).toISOString(),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["realtime-test"] });
  });
});
