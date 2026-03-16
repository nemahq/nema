import { z } from "zod";

import {
  getLlmPreset,
  type LlmPreset,
  setLlmPreset,
} from "@server/infra/providers";
import { publicProcedure, router } from "@server/trpc";

const llmPresetSchema = z.enum([
  "all-nano",
  "real-tiers",
]) satisfies z.ZodType<LlmPreset>;

export const devRouter = router({
  getModelPreset: publicProcedure.query(() => getLlmPreset()),
  setModelPreset: publicProcedure
    .input(z.object({ preset: llmPresetSchema }))
    .mutation(({ input }) => {
      setLlmPreset(input.preset);
      return input.preset;
    }),
});
