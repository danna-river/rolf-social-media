import type { Page } from 'playwright';
import type { OrgSeed, PostLink } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { collectPostLinksFromInfiniteGrid } from '../common/scroll';
import { normalizePostUrl, parsePostId } from '../common/urls';
import { evidenceTag, gotoAndSettle, type ExtractedPost } from './shared';

export const FACEBOOK_POST_LINK_SELECTOR =
  [
    'a[href*="/posts/"]',
    'a[href*="/videos/"]',
    'a[href*="/permalink/"]',
    'a[href*="/reel/"]',
    'a[href*="/photo/?fbid="]',
    'a[href*="/photo.php?fbid="]',
    'a[href*="story_fbid="]',
  ].join(', ');

export function isFacebookPostCandidateUrl(url: string, orgSlug: string): boolean {
  const isSlugPost =
    orgSlug.length > 0 &&
    (url.includes(`/${orgSlug}/posts/`) ||
      url.includes(`/${orgSlug}/videos/`) ||
      url.includes(`/${orgSlug}/permalink/`) ||
      url.includes(`/${orgSlug}/reel/`));
  const isFunctionalPermalink =
    /[?&](fbid|story_fbid)=/.test(url) ||
    /\/photo\/?\?/.test(url) ||
    /\/photo\.php\?/.test(url) ||
    /\/reel\/\d+/.test(url) ||
    /\/videos\/\d+/.test(url);

  return isSlugPost || isFunctionalPermalink;
}

export interface FacebookEmbeddedPostMetrics {
  publishedAt: string | null;
  publishedAtRaw: string | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
}

function numberMatches(pattern: RegExp, source: string): number[] {
  return [...source.matchAll(pattern)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

function uniqueNumberFallback(pattern: RegExp, source: string): number | null {
  const values = new Set(numberMatches(pattern, source));
  return values.size === 1 ? [...values][0] ?? null : null;
}

function bestFacebookEvidenceWindow(html: string, url: string): string {
  const postId = parsePostId(url, 'facebook');
  if (!postId) return html;

  const windows = [...html.matchAll(new RegExp(postId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))]
    .map((match) => {
      const index = match.index ?? 0;
      const window = html.slice(Math.max(0, index - 40_000), index + 60_000);
      const score = [
        'unified_reactors',
        'top_reactions',
        'share_count',
        'comment_rendering_instance',
        'creation_time',
        'publish_time',
      ].filter((needle) => window.includes(needle)).length;
      return { score, window };
    })
    .sort((a, b) => b.score - a.score);

  return windows[0]?.window ?? html;
}

export function extractFacebookEmbeddedPostMetrics(
  html: string,
  url: string,
): FacebookEmbeddedPostMetrics {
  const window = bestFacebookEvidenceWindow(html, url);
  const source = window.length > 0 ? window : html;

  const unifiedReactions = numberMatches(/"unified_reactors":\{"count":(\d+)\}/g, source).filter(
    (value) => value > 0,
  );
  const topReactionSums = [...source.matchAll(/"top_reactions":\{"edges":\[(.*?)\]\}/g)]
    .map((match) => numberMatches(/"reaction_count":(\d+)/g, match[1] ?? '').reduce((a, b) => a + b, 0))
    .filter((value) => value > 0);

  const reactionCandidates = unifiedReactions.length > 0 ? unifiedReactions : topReactionSums;
  const reactions =
    reactionCandidates.length > 0
      ? Math.max(...reactionCandidates)
      : source.includes('"reaction_count":{"count":0}')
        ? 0
        : uniqueNumberFallback(/"reaction_count":\{"count":(\d+)\}/g, html);

  const comments = (() => {
    const values = numberMatches(
      /"comment_rendering_instance":\{"comments":\{"total_count":(\d+)\}/g,
      source,
    );
    return values.length > 0
      ? Math.max(...values)
      : uniqueNumberFallback(
          /"comment_rendering_instance":\{"comments":\{"total_count":(\d+)\}/g,
          html,
        );
  })();

  const shares = (() => {
    const values = numberMatches(/"share_count":\{"count":(\d+)\}/g, source);
    return values.length > 0
      ? Math.max(...values)
      : uniqueNumberFallback(/"share_count":\{"count":(\d+)\}/g, html);
  })();

  const timestamp = (() => {
    const values = numberMatches(/"(?:creation_time|publish_time)":(\d{10})/g, source);
    if (values.length === 0 && source !== html) {
      const globalValues = numberMatches(/"(?:creation_time|publish_time)":(\d{10})/g, html);
      if (new Set(globalValues).size === 1) return globalValues[0] ?? null;
      return null;
    }
    return values[0] ?? null;
  })();

  return {
    publishedAt: timestamp === null ? null : new Date(timestamp * 1000).toISOString(),
    publishedAtRaw: timestamp === null ? null : String(timestamp),
    reactions,
    comments,
    shares,
  };
}

/**
 * Enumerate permalinks from the page feed. Facebook links carry heavy tracking
 * params and duplicates; normalize and de-dupe here.
 */
export async function enumerateFacebookPostLinks(
  page: Page,
  org: OrgSeed,
  maxUrls: number,
): Promise<PostLink[]> {
  const tag = evidenceTag('facebook', org.organization_id, 'enumeration');
  await gotoAndSettle(page, org.account_url);
  await assertNoChallenge(page, 'facebook', tag);

  const links = await collectPostLinksFromInfiniteGrid(
    page,
    FACEBOOK_POST_LINK_SELECTOR,
    maxUrls * 2, // over-collect; comment permalinks and dupes get filtered below
  );

  const orgSlug = (() => {
    try {
      return new URL(org.account_url).pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    } catch {
      return '';
    }
  })();

  const seen = new Set<string>();
  const filtered: PostLink[] = [];
  for (const link of links) {
    const normalized = normalizePostUrl(link.url);
    if (seen.has(normalized)) continue;
    if (/comment_id=/.test(link.url)) continue;
    // Keep links that clearly belong to this page when the slug is knowable.
    if (!isFacebookPostCandidateUrl(normalized, orgSlug)) {
      continue;
    }
    seen.add(normalized);
    filtered.push({ url: normalized, discoveredAt: link.discoveredAt });
    if (filtered.length >= maxUrls) break;
  }
  return filtered;
}

/**
 * Facebook's UI is highly dynamic: open the permalink, capture body.innerText(),
 * and parse counts from visible text rather than class-based selectors.
 */
export async function extractFacebookPost(page: Page): Promise<ExtractedPost> {
  const bodyText = await page.locator('body').innerText();
  const html = await page.content().catch(() => '');
  const embedded = extractFacebookEmbeddedPostMetrics(html, page.url());
  const datetime = await page
    .locator('time')
    .first()
    .getAttribute('datetime')
    .catch(() => null);

  const reactionsRaw =
    bodyText.match(/All reactions:\s*([\d.,]+(?:\s*[KMB])?)/i)?.[1] ??
    bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+reactions?/i)?.[1] ??
    null;
  const commentsRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+comments?/i)?.[1] ?? null;
  const sharesRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+shares?/i)?.[1] ?? null;
  const viewsRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+views?/i)?.[1] ?? null;

  const url = page.url();
  const mediaType = /\/videos\//.test(url)
    ? 'video'
    : /\/reel\//.test(url)
      ? 'reel'
      : /\/photo\/|\/photo\.php/.test(url)
        ? 'image'
      : 'unknown';

  // Post text: best-effort — permalink pages usually lead with the post body.
  // Kept null-safe; the manual coder reads the live post regardless.
  const caption = await page
    .locator('[role="article"]')
    .first()
    .innerText()
    .catch(() => null);

  return {
    publishedAt: datetime ?? embedded.publishedAt,
    publishedAtRaw: embedded.publishedAtRaw,
    captionText: caption ? caption.slice(0, 4000) : null,
    visibleLikeCount: parseCompactCount(reactionsRaw) ?? embedded.reactions,
    visibleCommentCount: parseCompactCount(commentsRaw) ?? embedded.comments,
    visibleShareCount: parseCompactCount(sharesRaw) ?? embedded.shares,
    visibleViewCount: parseCompactCount(viewsRaw),
    mediaType,
  };
}
