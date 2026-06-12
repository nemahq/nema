import { z } from "zod";

export const StatementSearchInputSchema = z.object({
  query: z.string().trim().min(1),
});
export type StatementSearchInput = z.infer<typeof StatementSearchInputSchema>;
