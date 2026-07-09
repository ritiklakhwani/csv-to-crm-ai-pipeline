/**
 * A concurrency limiter: run at most N of these promises at a time.
 *
 * That is the only thing the pipeline needs from `p-limit`, and the whole implementation is a queue
 * and a counter, so it is not worth a dependency.
 */
export type LimitedTask<T> = () => Promise<T>;

export interface Limiter {
  <T>(task: LimitedTask<T>): Promise<T>;
  /** Tasks currently executing. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly pending: number;
}

export function pLimit(concurrency: number): Limiter {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }

  const queue: Array<() => void> = [];
  let active = 0;

  const release = (): void => {
    active -= 1;
    queue.shift()?.();
  };

  const limiter = (<T>(task: LimitedTask<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        active += 1;
        // Promise.resolve().then(task) turns a synchronous throw inside `task` into a rejection,
        // so one badly behaved task cannot escape the counter and wedge the queue.
        void Promise.resolve().then(task).then(resolve, reject).finally(release);
      };

      if (active < concurrency) start();
      else queue.push(start);
    })) as Limiter;

  Object.defineProperties(limiter, {
    active: { get: () => active },
    pending: { get: () => queue.length },
  });

  return limiter;
}
