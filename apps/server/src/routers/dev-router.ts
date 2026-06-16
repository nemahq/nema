import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { getEnv } from "@server/env";
import { listModelSpecs } from "@server/infra/llm/model-catalog";
import {
  clearTaskOverride,
  getAllTaskOverrides,
  LLM_TASK_SCHEMA,
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
      catalog: listModelSpecs(),
    };
  }),
  setTaskModel: protectedProcedure
    .input(z.object({ task: LLM_TASK_SCHEMA, modelId: z.string().min(1) }))
    .mutation(({ input }) => {
      assertDev();
      setTaskModel(input.task, input.modelId);
      return getAllTaskOverrides();
    }),
  clearTaskModel: protectedProcedure
    .input(z.object({ task: LLM_TASK_SCHEMA }))
    .mutation(({ input }) => {
      assertDev();
      clearTaskOverride(input.task);
      return getAllTaskOverrides();
    }),
});
