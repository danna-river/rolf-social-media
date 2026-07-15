import type { Page } from 'playwright';
import type { OrgSeed, PostLink } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { collectPostLinksFromInfiniteGrid } from '../common/scroll';
import { normalizePostUrl, postsListingUrl } from '../common/urls';
import { evidenceTag, gotoAndSettle, type ExtractedPost } from './shared';

export const LINKEDIN_POST_LINK_SELECTOR =
  'a[href*="/feed/update/"], a[href*="/posts/"]';

export async function enumerateLinkedInPostLinks(
  page: Page,
  org: OrgSeed,
  maxUrls: number,
): Promise<PostLink[]> {
  const tag = evidenceTag('linkedin', org.organization_id, 'enumeration');
  await gotoAndSettle(page, postsListingUrl(org.account_url, 'linkedin'));
  await assertNoChallenge(page, 'linkedin', tag);

  const links = await collectPostLinksFromInfiniteGrid(
    page,
    LINKEDIN_POST_LINK_SELECTOR,
    maxUrls * 2,
  );

  const seen = new Set<string>();
  const filtered: PostLink[] = [];
  for (const link of links) {
    const normalized = normalizePostUrl(link.url);
    // Keep only post/update permalinks, not company sub-pages like /posts/?feedView=all
    if (!/\/feed\/update\/|activity-\d+|urn:li:activity:/i.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    filtered.push({ url: normalized, discoveredAt: link.discoveredAt });
    if (filtered.length >= maxUrls) break;
  }
  return filtered;
}

export async function extractLinkedInPost(page: Page): Promise<ExtractedPost> {
  const body = await page.locator('body').innerText();
  const published = await page
    .locator('time')
    .first()
    .getAttribute('datetime')
    .catch(() => null);
  const publishedRaw = await page
    .locator('time')
    .first()
    .innerText()
    .catch(() => null);

  const reactionsRaw =
    body.match(/([\d.,]+(?:\s*[KMB])?)\s+(?:reactions?|likes?)/i)?.[1] ?? null;
  const commentsRaw = body.match(/([\d.,]+(?:\s*[KMB])?)\s+comments?/i)?.[1] ?? null;
  const repostsRaw =
    body.match(/([\d.,]+(?:\s*[KMB])?)\s+(?:reposts?|shares?)/i)?.[1] ?? null;
  const viewsRaw = body.match(/([\d.,]+(?:\s*[KMB])?)\s+views?/i)?.[1] ?? null;

  const caption = await page
    .locator('.feed-shared-update-v2, [data-urn], article')
    .first()
    .innerText()
    .catch(() => null);

  return {
    publishedAt: published,
    publishedAtRaw: publishedRaw,
    captionText: caption ? caption.slice(0, 4000) : null,
    visibleLikeCount: parseCompactCount(reactionsRaw),
    visibleCommentCount: parseCompactCount(commentsRaw),
    visibleShareCount: parseCompactCount(repostsRaw),
    visibleViewCount: parseCompactCount(viewsRaw),
    mediaType: 'unknown', // attachment type is hand-coded (format_coded)
  };
}
