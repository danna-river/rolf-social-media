import { PACING } from '../config/constants';
import { isRunStopper } from './errors';
import { log } from './logger';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitterMs(range: readonly [number, number]): number {
  const [min, max] = range;
  return Math.round(min + Math.random() * (max - min));
}

/** 2–5 s between page-level navigations. */
export async function paceBetweenPages(): Promise<void> {
  await sleep(jitterMs(PACING.navDelayMs));
}

/** 8–15 s between account-level profile transitions. */
export async function paceBetweenAccounts(): Promise<void> {
  await sleep(jitterMs(PACING.accountDelayMs));
}

/** Long pause after every N post pages, page pacing otherwise. */
export class PostPacer {
  private count = 0;

  async tick(): Promise<void> {
    this.count++;
    if (this.count % PACING.pauseEveryNPosts === 0) {
      const ms = jitterMs(PACING.longPauseMs);
      log.info(`Pausing ${Math.round(ms / 1000)}s after ${this.count} post pages`);
      await sleep(ms);
    } else {
      await paceBetweenPages();
    }
  }
}

/**
 * Retry recoverable errors up to `retries` times. Platform challenges and auth
 * failures are never retried — they propagate so the caller stops the run.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRunStopper(err)) throw err;
      lastErr = err;
      if (attempt < retries) {
        log.warn(
          `${opts.label ?? 'operation'} failed (attempt ${attempt + 1}/${retries + 1}): ${String(err)} — retrying`,
        );
        await paceBetweenPages();
      }
    }
  }
  throw lastErr;
}
