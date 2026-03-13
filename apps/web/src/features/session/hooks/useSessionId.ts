import { useParams } from "@tanstack/react-router";

export function useSessionId(): string {
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });
  return sessionId;
}
