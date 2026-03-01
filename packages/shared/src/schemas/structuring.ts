import { z } from "zod";

/**
 * Phase 1 — Draft output from structuring LLM.
 * Generated during conversation; no DB awareness.
 */
export const StructuredDraftSchema = z.object({
  title: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  body: z.string(),
});

export type StructuredDraft = z.infer<typeof StructuredDraftSchema>;

/**
 * Phase 2 — Save output from structuring LLM.
 * Generated at explicit save trigger; includes create/update decision.
 * Discriminated union enforces: create → null target_id, update → string target_id.
 */
export const StructuredSaveSchema = z.discriminatedUnion("action", [
  StructuredDraftSchema.extend({
    action: z.literal("create"),
    target_id: z.null(),
  }),
  StructuredDraftSchema.extend({
    action: z.literal("update"),
    target_id: z.string(),
  }),
]);

export type StructuredSave = z.infer<typeof StructuredSaveSchema>;
