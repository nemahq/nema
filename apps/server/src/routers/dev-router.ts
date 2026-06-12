import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { getEnv } from "@server/env";
import {
  getLlmPreset,
  type LlmPreset,
  setLlmPreset,
} from "@server/infra/providers";
import { protectedProcedure, router } from "@server/trpc";

const llmPresetSchema = z.enum([
  "all-nano",
  "real-tiers",
]) satisfies z.ZodType<LlmPreset>;

function assertDev(): void {
  if (getEnv().APP_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const devRouter = router({
  getModelPreset: protectedProcedure.query(() => {
    assertDev();
    return getLlmPreset();
  }),
  setModelPreset: protectedProcedure
    .input(z.object({ preset: llmPresetSchema }))
    .mutation(({ input }) => {
      assertDev();
      setLlmPreset(input.preset);
      return getLlmPreset();
    }),
});
