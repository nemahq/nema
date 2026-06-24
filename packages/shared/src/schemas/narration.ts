import { z } from "zod";

export const NarrationInputSchema = z.object({
  query: z.string().trim().min(1),
});
export type NarrationInput = z.infer<typeof NarrationInputSchema>;
