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
 */
export const StructuredSaveSchema = StructuredDraftSchema.extend({
  action: z.enum(["create", "update"]),
  target_id: z.string().nullable(),
});

export type StructuredSave = z.infer<typeof StructuredSaveSchema>;
