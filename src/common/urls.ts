import type { Platform } from '../config/schema';

const TRACKING_PARAMS = new Set([
  'fbclid', 'igsh', 'igshid', 'ref', 'refsrc', 'ref_src', 'mibextid', 'rdid',
  'share_url', 'wtsid', 'locale', 'checkpoint_src', 'rcm', 'so', 'si', 'trk',
  'trackingid', 'original_referer', 'originalsubdomain', 'e', 's', 'paipv',
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || k.startsWith('__') || TRACKING_PARAMS.has(k);
}

/**
 * Strip tracking params, canonicalize protocol/host, drop fragments.
 * Functional params (e.g. Facebook's story_fbid/id) are preserved.
 */
export function normalizePostUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }
  u.protocol = 'https:';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^m\./, 'www.');
  const keys = [...u.searchParams.keys()];
  for (const key of keys) {
    if (isTrackingParam(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  let out = u.toString();
  // Canonical trailing slash for path-only URLs (Instagram permalinks etc.)
  if (!u.search && !out.endsWith('/')) out += '/';
  return out;
}

/** p / reel / posts / videos / permalink / feed-update etc. from the URL shape. */
export function postTypeUrlHint(url: string, platform: Platform): string | null {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  if (platform === 'instagram') {
    if (/\/reel\//.test(path)) return 'reel';
    if (/\/p\//.test(path)) return 'p';
    return null;
  }
  if (platform === 'facebook') {
    if (/\/videos\//.test(path)) return 'videos';
    if (/\/reel\//.test(path)) return 'reel';
    if (/\/posts\//.test(path)) return 'posts';
    if (/\/photo\/?/.test(path) && /[?&]fbid=/.test(url)) return 'photo';
    if (/\/photo\.php/.test(path) && /[?&]fbid=/.test(url)) return 'photo';
    if (/permalink/.test(url)) return 'permalink';
    return null;
  }
  if (/\/feed\/update\//.test(path)) return 'feed-update';
  if (/\/posts\//.test(path)) return 'posts';
  return null;
}

export function parsePostId(url: string, platform: Platform): string | null {
  if (platform === 'instagram') {
    return url.match(/\/(?:p|reel)\/([^/?#]+)/)?.[1] ?? null;
  }
  if (platform === 'facebook') {
    const m =
      url.match(/\/posts\/([^/?#]+)/) ??
      url.match(/\/videos\/(\d+)/) ??
      url.match(/\/reel\/(\d+)/) ??
      url.match(/[?&]fbid=([^&]+)/) ??
      url.match(/story_fbid=([^&]+)/);
    return m?.[1] ?? null;
  }
  const m =
    url.match(/urn:li:activity:(\d+)/) ??
    url.match(/activity-(\d+)/) ??
    url.match(/\/posts\/([^/?#]+)/);
  return m?.[1] ?? null;
}

/** The page to open when enumerating an org's posts. */
export function postsListingUrl(accountUrl: string, platform: Platform): string {
  if (platform !== 'linkedin') return accountUrl;
  const base = accountUrl.replace(/\/+$/, '');
  return base.endsWith('/posts') ? `${base}/` : `${base}/posts/?feedView=all`;
}
