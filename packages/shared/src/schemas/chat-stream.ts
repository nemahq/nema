import { z } from "zod";

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string().min(1) }),
  z.object({ type: z.literal("title"), title: z.string().min(1) }),
  z.object({ type: z.literal("done") }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
