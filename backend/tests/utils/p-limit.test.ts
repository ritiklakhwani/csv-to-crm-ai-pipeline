import { describe, expect, it } from 'vitest';
import { chunk } from '../../src/utils/chunk';
import { pLimit } from '../../src/utils/p-limit';

/** A promise you resolve by hand, so a test can pin tasks open and inspect the limiter. */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('pLimit', () => {
  it('runs a task and returns its value', async () => {
    const limit = pLimit(2);
    await expect(limit(async () => 42)).resolves.toBe(42);
  });

  it('never exceeds the concurrency cap', async () => {
    const limit = pLimit(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;

    const tasks = gates.map((gate) =>
      limit(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      }),
    );

    await tick();
    expect(running).toBe(2);
    expect(limit.active).toBe(2);
    expect(limit.pending).toBe(2);

    for (const gate of gates) gate.resolve();
    await Promise.all(tasks);

    expect(peak).toBe(2);
    expect(limit.active).toBe(0);
    expect(limit.pending).toBe(0);
  });

  it('starts a queued task as soon as a slot frees up', async () => {
    const limit = pLimit(1);
    const first = deferred();
    const started: string[] = [];

    const a = limit(async () => {
      started.push('a');
      await first.promise;
    });
    const b = limit(async () => {
      started.push('b');
    });

    await tick();
    expect(started).toEqual(['a']);

    first.resolve();
    await Promise.all([a, b]);
    expect(started).toEqual(['a', 'b']);
  });

  it('rejects the caller, not the scheduler, when a task throws', async () => {
    const limit = pLimit(2);
    const boom = new Error('boom');

    await expect(limit(async () => Promise.reject(boom))).rejects.toThrow(boom);
    // The slot is released, so the limiter is still usable.
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
    expect(limit.active).toBe(0);
  });

  it('releases the slot when a task throws synchronously', async () => {
    const limit = pLimit(1);

    await expect(
      limit((() => {
        throw new Error('sync boom');
      }) as () => Promise<never>),
    ).rejects.toThrow('sync boom');

    await expect(limit(async () => 'still works')).resolves.toBe('still works');
    expect(limit.active).toBe(0);
  });

  it('keeps running the remaining tasks after one fails', async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => 1),
      limit(async () => Promise.reject(new Error('nope'))),
      limit(async () => 3),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('rejects a non-positive concurrency', () => {
    expect(() => pLimit(0)).toThrow(RangeError);
    expect(() => pLimit(1.5)).toThrow(RangeError);
  });
});

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when the size exceeds the input', () => {
    expect(chunk([1, 2], 25)).toEqual([[1, 2]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunk([], 25)).toEqual([]);
  });

  it('divides evenly without emitting a trailing empty chunk', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    chunk(input, 2);
    expect(input).toEqual([1, 2, 3]);
  });

  it('rejects a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});
