import { trpc } from "@web/lib/trpc";

export function useMessageList({ sessionId }: { sessionId: string }) {
  const [messages] = trpc.message.list.useSuspenseQuery({ sessionId });
  return messages;
}
