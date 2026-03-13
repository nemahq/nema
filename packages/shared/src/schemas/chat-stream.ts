import { z } from "zod";

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({ type: z.literal("title"), title: z.string() }),
  z.object({ type: z.literal("done") }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
