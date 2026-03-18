import { z } from "zod";

export const SaveJobStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);
export type SaveJobStatus = z.infer<typeof SaveJobStatusSchema>;

export const SaveJobSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: SaveJobStatusSchema,
  snippet: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type SaveJob = z.infer<typeof SaveJobSchema>;

export const SaveJobEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job_update"),
    job: SaveJobSchema,
  }),
]);
export type SaveJobEvent = z.infer<typeof SaveJobEventSchema>;

export const EnqueueSaveInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type EnqueueSaveInput = z.infer<typeof EnqueueSaveInputSchema>;

export const RetrySaveInputSchema = z.object({
  jobId: z.string().uuid(),
});
export type RetrySaveInput = z.infer<typeof RetrySaveInputSchema>;
