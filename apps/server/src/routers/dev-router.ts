import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { getEnv } from "@server/env";
import { MODEL_CATALOG } from "@server/infra/llm/model-catalog";
import type { LlmTask } from "@server/infra/llm/task-routing";
import {
  clearTaskOverride,
  getAllTaskOverrides,
} from "@server/infra/llm/task-routing";
import {
  getLlmPreset,
  type LlmPreset,
  setLlmPreset,
  setTaskModel,
} from "@server/infra/providers";
import { protectedProcedure, router } from "@server/trpc";

const llmPresetSchema = z.enum([
  "all-nano",
  "real-tiers",
]) satisfies z.ZodType<LlmPreset>;

const llmTaskSchema = z.enum([
  "drafting",
  "draftIntent",
  "sessionTitle",
  "extraction",
  "relationJudgment",
]) satisfies z.ZodType<LlmTask>;

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
  getTaskModels: protectedProcedure.query(() => {
    assertDev();
    return {
      overrides: getAllTaskOverrides(),
      catalog: Object.values(MODEL_CATALOG),
    };
  }),
  setTaskModel: protectedProcedure
    .input(z.object({ task: llmTaskSchema, modelId: z.string().min(1) }))
    .mutation(({ input }) => {
      assertDev();
      setTaskModel(input.task, input.modelId);
      return getAllTaskOverrides();
    }),
  clearTaskModel: protectedProcedure
    .input(z.object({ task: llmTaskSchema }))
    .mutation(({ input }) => {
      assertDev();
      clearTaskOverride(input.task);
      return getAllTaskOverrides();
    }),
});
