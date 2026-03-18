import { EventEmitter } from "node:events";

import type { SaveJob } from "@nema-io/shared";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitSaveJobUpdate(userId: string, job: SaveJob): void {
  emitter.emit(`save-job:${userId}`, job);
}

export function onSaveJobUpdate(
  userId: string,
  callback: (job: SaveJob) => void,
): () => void {
  const event = `save-job:${userId}`;
  emitter.on(event, callback);
  return () => {
    emitter.off(event, callback);
  };
}
