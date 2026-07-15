import { LOGIN_URLS, profileDir, type PlatformName } from '../config/constants';
import { log } from '../common/logger';
import { launchAuditContext } from './context';

/**
 * Manual login flow: open the platform login page in the persistent automation
 * profile, let the operator log in (including any 2FA) by hand, and save the
 * session by simply closing the browser window. No credentials ever touch code.
 */
export async function runLoginFlow(platform: PlatformName): Promise<void> {
  const dir = profileDir(platform);
  log.info(`Launching persistent ${platform} profile at ${dir}`);
  const context = await launchAuditContext(dir);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(LOGIN_URLS[platform], { waitUntil: 'domcontentloaded' });

  console.log(
    [
      '',
      `== Manual login: ${platform} ==`,
      '1. Log in manually in the opened browser window.',
      '2. Complete any 2FA manually.',
      '3. When you can see your feed / home page, CLOSE the browser window.',
      '   The session is saved in the persistent profile automatically.',
      '',
      'Do not solve CAPTCHAs on behalf of automation — this window is a normal',
      'human login. If the platform refuses login, stop and try later.',
      '',
    ].join('\n'),
  );

  await new Promise<void>((resolve) => context.once('close', () => resolve()));
  log.info(`${platform} session saved to ${dir}. You can now run collection scripts.`);
}
