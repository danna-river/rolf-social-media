import type { Page } from 'playwright';
import {
  CHALLENGE_PATTERNS,
  CHALLENGE_URL_PATTERN,
  LOGIN_URL_PATTERN,
} from '../config/constants';
import type { Platform } from '../config/schema';
import { FatalAuthError, PlatformChallengeError } from './errors';
import { captureEvidence } from './evidence';
import { log } from './logger';

/**
 * Hard stop on suspicious-activity interstitial, checkpoint, CAPTCHA, or forced
 * logout. Called after every navigation, before any extraction.
 */
export async function assertNoChallenge(
  page: Page,
  platform: Platform,
  evidenceTag: string,
): Promise<void> {
  const url = page.url();

  if (CHALLENGE_URL_PATTERN.test(url)) {
    const shot = await captureEvidence(page, `${evidenceTag}_challenge`);
    log.error(`Challenge URL detected on ${platform}: ${url}`);
    throw new PlatformChallengeError(platform, `Challenge/checkpoint URL: ${url}`, shot);
  }

  if (LOGIN_URL_PATTERN.test(url)) {
    await captureEvidence(page, `${evidenceTag}_logged_out`);
    throw new FatalAuthError(
      platform,
      `Redirected to login (${url}) — session expired. Re-run the ${platform} login script.`,
    );
  }

  const body = await page.locator('body').innerText().catch(() => '');
  for (const pattern of CHALLENGE_PATTERNS) {
    if (pattern.test(body)) {
      const shot = await captureEvidence(page, `${evidenceTag}_challenge`);
      log.error(`Challenge text matched ${pattern} on ${platform} at ${url}`);
      throw new PlatformChallengeError(
        platform,
        `Challenge pattern ${pattern} matched in page text`,
        shot,
      );
    }
  }
}
