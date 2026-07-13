import { z } from "zod";

export const SPACE_NAME_MAX_LENGTH = 50;

const SpaceNameSchema = z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH);

export const SpaceSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string(),
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Space = z.infer<typeof SpaceSchema>;

export const SpaceCreateInputSchema = z.object({
  name: SpaceNameSchema,
});
export type SpaceCreateInput = z.infer<typeof SpaceCreateInputSchema>;

export const SpaceUpdateInputSchema = z.object({
  spaceId: z.string().uuid(),
  name: SpaceNameSchema,
});
export type SpaceUpdateInput = z.infer<typeof SpaceUpdateInputSchema>;

export const SpaceDeleteInputSchema = z.object({
  spaceId: z.string().uuid(),
});
export type SpaceDeleteInput = z.infer<typeof SpaceDeleteInputSchema>;
