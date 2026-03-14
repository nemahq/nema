import { useParams } from "@tanstack/react-router";

export function useSessionId(): string {
  const { sessionId } = useParams({
    from: "/_authenticated/_contextSidebar/context/$sessionId",
  });
  return sessionId;
}
