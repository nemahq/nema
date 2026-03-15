import { describe, expect, it } from "vitest";

import { appRouter } from "./router";

const caller = appRouter.createCaller({
  req: {} as never,
  res: {} as never,
  log: console as never,
  user: null,
  lng: "ko",
  supabase: null,
  providers: null,
});

describe("appRouter", () => {
  it("health returns ok", async () => {
    const result = await caller.health();
    expect(result).toEqual({ status: "ok" });
  });

  it("providerProcedure throws PRECONDITION_FAILED when providers are null", async () => {
    const authedCaller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
      log: console as never,
      user: { id: "test-user" } as never,
      lng: "ko",
      supabase: {} as never,
      providers: null,
    });

    await expect(
      authedCaller.message.saveDraft({ sessionId: "test" }),
    ).rejects.toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }));
  });
});
