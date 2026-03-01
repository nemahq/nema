import { describe, it, expect } from "vitest";
import { appRouter } from "./router.js";

const caller = appRouter.createCaller({
  req: {} as never,
  res: {} as never,
  log: console as never,
});

describe("appRouter", () => {
  it("health returns ok", async () => {
    const result = await caller.health();
    expect(result).toEqual({ status: "ok" });
  });
});
