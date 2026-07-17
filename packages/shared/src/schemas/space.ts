import { z } from "zod";

export const SPACE_NAME_MAX_LENGTH = 50;

// 비가시 문자(zero-width, 한글 채움 문자, Unicode Tag 블록 등)만으로 채워
// 화면상 빈 이름처럼 보이게 하거나, 양방향 텍스트 방향 제어 문자로 표시를
// 위장하는 것을 막는다. 서버 zod 검증과 클라이언트 사전 검사가 같은 판정을
// 쓰도록 containsForbiddenSpaceNameChars로 노출한다.
const SPACE_NAME_FORBIDDEN_CHARS_PATTERN =
  // eslint-disable-next-line no-control-regex -- 제어문자를 의도적으로 차단 대상에 포함
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u3164\uFFA0\u{E0000}-\u{E007F}]/u;

export function containsForbiddenSpaceNameChars(name: string): boolean {
  return SPACE_NAME_FORBIDDEN_CHARS_PATTERN.test(name);
}

const SpaceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SPACE_NAME_MAX_LENGTH)
  .refine((name) => !containsForbiddenSpaceNameChars(name), {
    message: "Space name contains control or invisible characters",
  })
  .transform((name) => name.normalize("NFC"));

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
  openChangesetCount: z.number().int().min(0),
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
  deletePendingDrafts: z.boolean().optional(),
});
export type SpaceDeleteInput = z.infer<typeof SpaceDeleteInputSchema>;

export const SpaceCountPendingDraftsInputSchema = z.object({
  spaceId: z.string().uuid(),
});
export type SpaceCountPendingDraftsInput = z.infer<
  typeof SpaceCountPendingDraftsInputSchema
>;
