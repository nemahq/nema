// 동시 호출 상한 — 외부 의존성 없는 작은 세마포어.
// 워커의 추출 콜(분할 경로의 청크 병렬 포함)과 eval 러너가 같이 쓴다.

export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}
