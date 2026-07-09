import { describe, expect, it, vi } from 'vitest';
import { LlmProviderError, type LlmFailureKind } from '../../src/errors';
import { withRetry, type RetryContext } from '../../src/utils/retry';

/** Captures the delays that were requested, without ever waiting. */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

const fail = (kind: LlmFailureKind, retryAfterMs?: number): LlmProviderError =>
  new LlmProviderError(
    kind,
    `simulated ${kind}`,
    retryAfterMs === undefined ? {} : { retryAfterMs },
  );

describe('withRetry', () => {
  it('returns the value on the first attempt without sleeping', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(withRetry(fn, { attempts: 3, sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries a server error and succeeds on a later attempt', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(fail('server'))
      .mockRejectedValueOnce(fail('server'))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { attempts: 3, sleep, random: () => 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
  });

  it('throws the last error once attempts are exhausted', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn().mockRejectedValue(fail('server'));

    await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toMatchObject({ kind: 'server' });
    expect(fn).toHaveBeenCalledTimes(3);
    // Three attempts means two waits: it never sleeps after the final failure.
    expect(delays).toHaveLength(2);
  });

  describe('failure classification', () => {
    it.each<LlmFailureKind>(['rate_limit', 'server', 'invalid_output', 'truncated'])(
      'retries %s',
      async (kind) => {
        const { sleep } = fakeSleep();
        const fn = vi.fn().mockRejectedValueOnce(fail(kind)).mockResolvedValue('ok');

        await expect(withRetry(fn, { attempts: 2, sleep })).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
      },
    );

    it.each<LlmFailureKind>(['client', 'refusal', 'aborted'])(
      'fails fast on %s without sleeping',
      async (kind) => {
        const { sleep, delays } = fakeSleep();
        const fn = vi.fn().mockRejectedValue(fail(kind));

        await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toMatchObject({ kind });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(delays).toEqual([]);
      },
    );

    it('rethrows a non-provider error immediately, because retrying would rerun the bug', async () => {
      const { sleep } = fakeSleep();
      const bug = new TypeError('cannot read property of undefined');
      const fn = vi.fn().mockRejectedValue(bug);

      await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toThrow(bug);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('backoff', () => {
    it('doubles the ceiling each attempt (random() = 1 exposes the ceiling)', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValue(fail('server'));

      await expect(
        withRetry(fn, { attempts: 4, sleep, random: () => 1, baseDelayMs: 100 }),
      ).rejects.toBeInstanceOf(LlmProviderError);

      expect(delays).toEqual([100, 200, 400]);
    });

    it('caps the ceiling at maxDelayMs', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValue(fail('server'));

      await expect(
        withRetry(fn, { attempts: 4, sleep, random: () => 1, baseDelayMs: 1000, maxDelayMs: 1500 }),
      ).rejects.toBeInstanceOf(LlmProviderError);

      expect(delays).toEqual([1000, 1500, 1500]);
    });

    it('applies full jitter, so identical clients do not retry in lockstep', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValue(fail('server'));

      await expect(
        withRetry(fn, { attempts: 3, sleep, random: () => 0, baseDelayMs: 800 }),
      ).rejects.toBeInstanceOf(LlmProviderError);

      // random() = 0 draws the bottom of the range, not the ceiling.
      expect(delays).toEqual([0, 0]);
    });

    it('honours retry-after on a 429 instead of guessing', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValueOnce(fail('rate_limit', 7_500)).mockResolvedValue('ok');

      await expect(
        withRetry(fn, { attempts: 2, sleep, random: () => 1, baseDelayMs: 100 }),
      ).resolves.toBe('ok');

      expect(delays).toEqual([7_500]);
    });

    it('still caps a retry-after that exceeds maxDelayMs', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValueOnce(fail('rate_limit', 600_000)).mockResolvedValue('ok');

      await expect(withRetry(fn, { attempts: 2, sleep, maxDelayMs: 20_000 })).resolves.toBe('ok');
      expect(delays).toEqual([20_000]);
    });

    it('falls back to jitter when a 429 carries no retry-after header', async () => {
      const { sleep, delays } = fakeSleep();
      const fn = vi.fn().mockRejectedValueOnce(fail('rate_limit')).mockResolvedValue('ok');

      await expect(
        withRetry(fn, { attempts: 2, sleep, random: () => 1, baseDelayMs: 250 }),
      ).resolves.toBe('ok');

      expect(delays).toEqual([250]);
    });
  });

  describe('retry context', () => {
    it('tells the next attempt why the previous one failed', async () => {
      const { sleep } = fakeSleep();
      const seen: RetryContext[] = [];

      const fn = vi.fn(async (ctx: RetryContext) => {
        seen.push(ctx);
        if (ctx.attempt === 1) throw fail('truncated');
        return 'ok';
      });

      await expect(withRetry(fn, { attempts: 2, sleep })).resolves.toBe('ok');

      expect(seen[0]).toEqual({ attempt: 1 });
      expect(seen[1]?.attempt).toBe(2);
      // This is what lets the batch extractor halve a batch rather than skip it.
      expect(seen[1]?.previousError?.kind).toBe('truncated');
    });
  });

  describe('cancellation', () => {
    it('does not call fn at all when the signal is already aborted', async () => {
      const { sleep } = fakeSleep();
      const controller = new AbortController();
      controller.abort();
      const fn = vi.fn();

      await expect(
        withRetry(fn, { attempts: 3, sleep, signal: controller.signal }),
      ).rejects.toMatchObject({ kind: 'aborted' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('stops between attempts once the signal aborts', async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValue(fail('server'));

      await expect(
        withRetry(fn, {
          attempts: 5,
          signal: controller.signal,
          sleep: async () => {
            controller.abort();
          },
        }),
      ).rejects.toMatchObject({ kind: 'aborted' });

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('observability', () => {
    it('reports every retry so the summary can count them', async () => {
      const { sleep } = fakeSleep();
      const onRetry = vi.fn();
      const fn = vi.fn().mockRejectedValueOnce(fail('server')).mockResolvedValue('ok');

      await withRetry(fn, { attempts: 3, sleep, random: () => 1, baseDelayMs: 100, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1, delayMs: 100, error: expect.any(LlmProviderError) }),
      );
    });
  });

  it('rejects a non-positive attempt count', async () => {
    await expect(withRetry(vi.fn(), { attempts: 0 })).rejects.toThrow(RangeError);
  });
});
