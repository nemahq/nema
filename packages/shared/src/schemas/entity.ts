import { z } from "zod";

export const ENTITY_TYPES = [
  "Person",
  "Organization",
  "Topic",
  "Event",
  "Project",
  "Location",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const EntityTypeSchema = z.enum(ENTITY_TYPES);

export const EntitySummarySchema = z.object({
  name: z.string(),
  type: EntityTypeSchema,
  documentCount: z.number().int().nonnegative(),
});
export type EntitySummary = z.infer<typeof EntitySummarySchema>;

export const EntityTypeStatSchema = z.object({
  type: EntityTypeSchema,
  count: z.number().int().nonnegative(),
});
export type EntityTypeStat = z.infer<typeof EntityTypeStatSchema>;

export const EntityStatsSchema = z.object({
  totalDocuments: z.number().int().nonnegative(),
  entityCountByType: z.array(EntityTypeStatSchema),
});
export type EntityStats = z.infer<typeof EntityStatsSchema>;

export const EntityListInputSchema = z.object({
  type: EntityTypeSchema.optional(),
});
export type EntityListInput = z.infer<typeof EntityListInputSchema>;

export const EntityGetDocumentsInputSchema = z.object({
  name: z.string().min(1),
  type: EntityTypeSchema,
});
export type EntityGetDocumentsInput = z.infer<
  typeof EntityGetDocumentsInputSchema
>;

export const EntityGetRelatedInputSchema = z.object({
  name: z.string().min(1),
  type: EntityTypeSchema,
});
export type EntityGetRelatedInput = z.infer<typeof EntityGetRelatedInputSchema>;
