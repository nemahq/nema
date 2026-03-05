import { z } from "zod";

/**
 * Phase 1 — Draft output from structuring LLM.
 * Refined body + nullable session title (first call only). No DB awareness.
 * LLM returns null for session_title on edit cycles.
 */
export const DraftOutputSchema = z.object({
  body: z.string().min(1),
  session_title: z.string().min(1).nullable(),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/**
 * Phase 2 — Save output from structuring LLM.
 * Meta fields + create/update decision. Generated with DB context
 * (similar docs, existing tag pool). Discriminated union enforces:
 * create → null target_id, update → string target_id + merged_body.
 */
const Phase2MetaSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1).optional(), // pre-included; prompt rules TBD
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

export const SaveOutputSchema = z.discriminatedUnion("action", [
  Phase2MetaSchema.extend({
    action: z.literal("create"),
    target_id: z.null(),
  }),
  Phase2MetaSchema.extend({
    action: z.literal("update"),
    target_id: z.string().min(1),
    merged_body: z.string().min(1),
  }),
]);

export type SaveOutput = z.infer<typeof SaveOutputSchema>;
