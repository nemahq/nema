import { z } from "zod";

export const ArchiveStatementInputSchema = z.object({
  statementId: z.string().uuid(),
});
export type ArchiveStatementInput = z.infer<typeof ArchiveStatementInputSchema>;

export const ArchiveSourceInputSchema = z.object({
  sourceId: z.string().uuid(),
});
export type ArchiveSourceInput = z.infer<typeof ArchiveSourceInputSchema>;

export const RevertChangesetInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RevertChangesetInput = z.infer<typeof RevertChangesetInputSchema>;

export const ApplyPendingRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type ApplyPendingRelationInput = z.infer<
  typeof ApplyPendingRelationInputSchema
>;

export const RejectPendingRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RejectPendingRelationInput = z.infer<
  typeof RejectPendingRelationInputSchema
>;

export const CHANGESET_LIST_LIMIT_DEFAULT = 50;
export const CHANGESET_LIST_LIMIT_MAX = 100;

export const ListChangesetsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(CHANGESET_LIST_LIMIT_MAX)
    .default(CHANGESET_LIST_LIMIT_DEFAULT),
});
export type ListChangesetsInput = z.infer<typeof ListChangesetsInputSchema>;
