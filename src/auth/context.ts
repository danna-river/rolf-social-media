import { chromium, type BrowserContext } from 'playwright';

/**
 * Dedicated automation profile (never the operator's default Chrome profile).
 * Headed, single page, human-visible pacing via slowMo.
 */
export async function launchAuditContext(profileDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1200 },
    slowMo: 100,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  });
}
