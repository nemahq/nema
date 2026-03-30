import { EventEmitter } from "node:events";

import type { ChatStreamEvent } from "@nema-io/shared";

const BUFFER_TTL_MS = 300_000; // 5분

interface GenerationState {
  events: ChatStreamEvent[];
  emitter: EventEmitter;
  status: "running" | "done" | "error";
  error?: unknown;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const generations = new Map<string, GenerationState>();

function scheduleCleanup(sessionId: string): void {
  const state = generations.get(sessionId);
  if (!state) {
    return;
  }
  state.cleanupTimer = setTimeout(() => {
    generations.delete(sessionId);
  }, BUFFER_TTL_MS);
}

export function hasActiveGeneration(sessionId: string): boolean {
  return generations.has(sessionId);
}

interface GenerationHandle {
  emit: (event: ChatStreamEvent) => void;
  complete: () => void;
  fail: (error: unknown) => void;
}

export function startGeneration(sessionId: string): GenerationHandle {
  const existing = generations.get(sessionId);
  if (existing?.status === "running") {
    throw new Error(`Generation already running for session ${sessionId}.`);
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
  };
  generations.set(sessionId, state);

  return {
    emit(event: ChatStreamEvent) {
      state.events.push(event);
      emitter.emit("event", event);
    },
    complete() {
      state.status = "done";
      emitter.emit("end");
      scheduleCleanup(sessionId);
    },
    fail(error: unknown) {
      state.status = "error";
      state.error = error;
      emitter.emit("error", error);
      scheduleCleanup(sessionId);
    },
  };
}

export async function* subscribe(
  sessionId: string,
): AsyncGenerator<ChatStreamEvent> {
  const state = generations.get(sessionId);
  if (!state) {
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
  state.emitter.on("error", onError);

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
    state.emitter.off("error", onError);
  }
}

export function cancelGeneration(sessionId: string): void {
  const state = generations.get(sessionId);
  if (!state || state.status !== "running") {
    return;
  }
  state.status = "done";
  state.emitter.emit("end");
  scheduleCleanup(sessionId);
}

export async function runGeneration(
  sessionId: string,
  stream: AsyncIterable<ChatStreamEvent>,
): Promise<void> {
  const handle = startGeneration(sessionId);
  try {
    for await (const event of stream) {
      handle.emit(event);
    }
    handle.complete();
  } catch (error) {
    handle.fail(error);
  }
}
