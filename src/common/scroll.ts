import type { Page } from 'playwright';
import type { PostLink } from '../config/schema';

/**
 * Enumerate post URLs from an infinite-scroll grid/feed. Stops when maxUrls is
 * reached or the page stops yielding new links for 5 consecutive rounds.
 */
export async function collectPostLinksFromInfiniteGrid(
  page: Page,
  linkSelector: string,
  maxUrls: number,
): Promise<PostLink[]> {
  const seen = new Set<string>();
  let stagnantRounds = 0;

  while (seen.size < maxUrls && stagnantRounds < 5) {
    const urls = await page
      .locator(linkSelector)
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean));

    const before = seen.size;
    for (const u of urls) seen.add(u);
    stagnantRounds = seen.size === before ? stagnantRounds + 1 : 0;

    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
  }

  return [...seen].slice(0, maxUrls).map((url) => ({
    url,
    discoveredAt: new Date().toISOString(),
  }));
}
