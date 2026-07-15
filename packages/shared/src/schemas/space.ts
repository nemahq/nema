import { z } from "zod";

export const SPACE_NAME_MAX_LENGTH = 50;

const SpaceNameSchema = z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH);

// generate_space_public_id() (supabase/migrations)가 SQL로 같은 형식을 만든다 —
// 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
export const SPACE_PUBLIC_ID_PREFIX = "spc_";
export const SPACE_PUBLIC_ID_LENGTH = 12;
export const SPACE_PUBLIC_ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SPACE_PUBLIC_ID_PATTERN = new RegExp(
  `^${SPACE_PUBLIC_ID_PREFIX}[0-9A-Za-z]{${SPACE_PUBLIC_ID_LENGTH}}$`,
);

export const SpaceSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().regex(SPACE_PUBLIC_ID_PATTERN),
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
  targetSpaceId: z.string().uuid().optional(),
});
export type SpaceDeleteInput = z.infer<typeof SpaceDeleteInputSchema>;
