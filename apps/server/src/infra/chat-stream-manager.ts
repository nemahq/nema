import { EventEmitter } from "node:events";

import * as Sentry from "@sentry/node";

import type { ChatStreamEvent } from "@nema-io/shared";

// 생성 완료 후 클라이언트 재연결을 위해 이벤트 버퍼를 유지하는 시간.
// 이 시간 안에 복귀하면 스트리밍 이벤트를 재생받고, 초과하면 DB 데이터로 정적 렌더된다.
const BUFFER_TTL_MS = 300_000;

interface GenerationState {
  events: ChatStreamEvent[];
  emitter: EventEmitter;
  status: "running" | "done" | "error";
  error?: unknown;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  abortController?: AbortController;
}

const generations = new Map<string, GenerationState>();

function makeKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

function scheduleCleanup(key: string): void {
  const state = generations.get(key);
  if (!state) {
    return;
  }
  state.cleanupTimer = setTimeout(() => {
    generations.delete(key);
  }, BUFFER_TTL_MS);
}

export function hasActiveGeneration(
  userId: string,
  sessionId: string,
): boolean {
  const state = generations.get(makeKey(userId, sessionId));
  return state?.status === "running";
}

interface GenerationHandle {
  emit: (event: ChatStreamEvent) => void;
  complete: () => void;
  fail: (error: unknown) => void;
}

function startGeneration(
  key: string,
  abortController?: AbortController,
): GenerationHandle {
  const existing = generations.get(key);
  if (existing?.status === "running") {
    throw new Error(`Generation already running for ${key}.`);
  }

  if (existing?.cleanupTimer) {
    clearTimeout(existing.cleanupTimer);
  }

  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  const state: GenerationState = {
    events: [],
    emitter,
    status: "running",
    abortController,
  };
  generations.set(key, state);

  return {
    emit(event: ChatStreamEvent) {
      if (state.status !== "running") {
        return;
      }
      state.events.push(event);
      emitter.emit("event", event);
    },
    complete() {
      if (state.status !== "running") {
        return;
      }
      state.status = "done";
      emitter.emit("end");
      scheduleCleanup(key);
    },
    fail(error: unknown) {
      if (state.status !== "running") {
        return;
      }
      state.status = "error";
      state.error = error;
      emitter.emit("stream_error", error);
      scheduleCleanup(key);
    },
  };
}

export async function* subscribe(
  userId: string,
  sessionId: string,
): AsyncGenerator<ChatStreamEvent> {
  const key = makeKey(userId, sessionId);
  const state = generations.get(key);
  if (!state) {
    yield { type: "done" };
    return;
  }

  // 버퍼된 이벤트 재생
  for (const event of state.events) {
    yield event;
  }

  if (state.status === "done") {
    return;
  }

  if (state.status === "error") {
    throw state.error;
  }

  // 라이브 이벤트 구독
  const queue: ChatStreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  let streamError: unknown = null;

  function onEvent(event: ChatStreamEvent) {
    queue.push(event);
    resolve?.();
  }

  function onEnd() {
    done = true;
    resolve?.();
  }

  function onError(error: unknown) {
    streamError = error;
    done = true;
    resolve?.();
  }

  state.emitter.on("event", onEvent);
  state.emitter.on("end", onEnd);
  state.emitter.on("stream_error", onError);

  try {
    while (!done || queue.length > 0) {
      if (queue.length === 0 && !done) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
      while (queue.length > 0) {
        const event = queue.shift();
        if (event) {
          yield event;
        }
      }
    }

    if (streamError) {
      throw streamError;
    }
  } finally {
    state.emitter.off("event", onEvent);
    state.emitter.off("end", onEnd);
    state.emitter.off("stream_error", onError);
  }
}

export function cancelGeneration(userId: string, sessionId: string): void {
  const key = makeKey(userId, sessionId);
  const state = generations.get(key);
  if (!state || state.status !== "running") {
    return;
  }
  state.abortController?.abort();
  state.status = "done";
  state.emitter.emit("end");
  scheduleCleanup(key);
}

export async function runGeneration(args: {
  userId: string;
  sessionId: string;
  stream: AsyncIterable<ChatStreamEvent>;
  abortController?: AbortController;
}): Promise<void> {
  const { userId, sessionId, stream, abortController } = args;
  const key = makeKey(userId, sessionId);
  let handle: GenerationHandle;
  try {
    handle = startGeneration(key, abortController);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "chat-stream-manager" },
      extra: { sessionId },
    });
    return;
  }
  try {
    for await (const event of stream) {
      handle.emit(event);
    }
    handle.complete();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "chat-stream-manager" },
      extra: { sessionId },
    });
    handle.fail(error);
  }
}
