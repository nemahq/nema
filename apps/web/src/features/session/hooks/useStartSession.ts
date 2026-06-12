import { useNavigate } from "@tanstack/react-router";

import type { ChatMode } from "@nema-io/shared";

import {
  HOME_TO_SESSION_INITIAL_MESSAGE_KEY,
  HOME_TO_SESSION_INITIAL_MODE_KEY,
} from "@web/app/constants/routeState";

import { useCreateSession } from "./useCreateSession";

export function useStartSession() {
  const navigate = useNavigate();
  const createSession = useCreateSession();

  function startSession(content: string, mode: ChatMode) {
    const sessionId = crypto.randomUUID();

    createSession.mutate(
      { sessionId },
      {
        onError: () => {
          navigate({ to: "/", replace: true });
        },
      },
    );

    navigate({
      to: "/session/$sessionId",
      params: { sessionId },
      state: (prev) => ({
        ...prev,
        [HOME_TO_SESSION_INITIAL_MESSAGE_KEY]: content,
        [HOME_TO_SESSION_INITIAL_MODE_KEY]: mode,
      }),
    });
  }

  return { startSession, isPending: createSession.isPending };
}
