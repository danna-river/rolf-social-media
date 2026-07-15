import type { Page } from 'playwright';
import type { OrgSeed, PostLink } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { collectPostLinksFromInfiniteGrid } from '../common/scroll';
import { normalizePostUrl } from '../common/urls';
import {
  extractInstagramEmbeddedCaption,
  parseInstagramMetaDescription,
} from './instagram.meta';
import { evidenceTag, gotoAndSettle, type ExtractedPost } from './shared';

export const INSTAGRAM_POST_LINK_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"]';

/** Pass 1: enumerate post permalinks from the profile grid, newest-first. */
export async function enumerateInstagramPostLinks(
  page: Page,
  org: OrgSeed,
  maxUrls: number,
): Promise<PostLink[]> {
  const tag = evidenceTag('instagram', org.organization_id, 'enumeration');
  await gotoAndSettle(page, org.account_url);
  await assertNoChallenge(page, 'instagram', tag);

  const links = await collectPostLinksFromInfiniteGrid(
    page,
    INSTAGRAM_POST_LINK_SELECTOR,
    maxUrls,
  );

  const seen = new Set<string>();
  return links.filter((l) => {
    const key = normalizePostUrl(l.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Pass 2: extract public metrics from one post page.
 * Primary source (calibrated 2026-07-14): the server-rendered og:description
 * meta tag carries "N likes, M comments - handle on <date>". The full caption
 * comes from the page's embedded JSON. Body-text regex remains the fallback
 * for older UI variants.
 */
export async function extractInstagramPost(page: Page): Promise<ExtractedPost> {
  const bodyText = await page.locator('body').innerText();
  const timeEl = page.locator('time').first();
  const datetime = await timeEl.getAttribute('datetime').catch(() => null);
  const datetimeRaw = await timeEl.innerText().catch(() => null);

  const metaContent =
    (await page
      .locator('meta[property="og:description"]')
      .first()
      .getAttribute('content')
      .catch(() => null)) ??
    (await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute('content')
      .catch(() => null));
  const meta = parseInstagramMetaDescription(metaContent);

  const likesRaw =
    meta.likesRaw ?? bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+likes?/i)?.[1] ?? null;
  const commentsRaw =
    meta.commentsRaw ?? bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+comments?/i)?.[1] ?? null;
  const viewsRaw =
    bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+(?:views?|plays?)/i)?.[1] ?? null;

  const html = await page.content();
  const caption =
    extractInstagramEmbeddedCaption(html) ??
    meta.captionStart ??
    (await page.locator('article').first().innerText().catch(() => null));

  const hasCarouselNext = await page
    .locator('button[aria-label="Next"]')
    .first()
    .isVisible()
    .catch(() => false);
  const mediaType = page.url().includes('/reel/')
    ? 'reel'
    : hasCarouselNext
      ? 'carousel'
      : 'image_or_unknown';

  return {
    publishedAt: datetime,
    publishedAtRaw: datetimeRaw ?? meta.dateRaw,
    captionText: caption,
    visibleLikeCount: parseCompactCount(likesRaw),
    visibleCommentCount: parseCompactCount(commentsRaw),
    visibleShareCount: null, // Instagram does not show public share counts
    visibleViewCount: parseCompactCount(viewsRaw),
    mediaType,
  };
}
