import { z } from "zod";

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  summary: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  body: z.string().min(1),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const DocumentListInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type DocumentListInput = z.infer<typeof DocumentListInputSchema>;

export const DocumentGetInputSchema = z.object({
  documentId: z.string().uuid(),
});
export type DocumentGetInput = z.infer<typeof DocumentGetInputSchema>;

export const DocumentDeleteInputSchema = z.object({
  documentId: z.string().uuid(),
});
export type DocumentDeleteInput = z.infer<typeof DocumentDeleteInputSchema>;
