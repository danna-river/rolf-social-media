import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, RAW_DIR } from '../src/config/constants';
import type { PostLink, PostLinkFile } from '../src/config/schema';
import { nowIso } from '../src/common/dates';
import { log } from '../src/common/logger';
import { selectSeeds } from '../src/common/seeds';
import { writeJsonFile } from '../src/common/store';
import { normalizePostUrl, postsListingUrl } from '../src/common/urls';
import {
  FACEBOOK_POST_LINK_SELECTOR,
  isFacebookPostCandidateUrl,
} from '../src/collectors/facebook.posts';

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function orgSlug(accountUrl: string): string {
  try {
    return new URL(accountUrl).pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  } catch {
    return '';
  }
}

function extractFacebookHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const hrefPattern = /href=(["'])(https:\/\/www\.facebook\.com\/.*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[2];
    if (href) hrefs.push(decodeHtmlAttr(href));
  }
  return hrefs;
}

function isSelectorMatch(url: string): boolean {
  return FACEBOOK_POST_LINK_SELECTOR.split(', ').some((selector) => {
    const needle = selector.match(/\[href\*="(.+)"\]/)?.[1];
    return needle ? url.includes(needle) : false;
  });
}

function linksFromEvidence(html: string, slug: string): PostLink[] {
  const seen = new Set<string>();
  const links: PostLink[] = [];
  const discoveredAt = nowIso();

  for (const href of extractFacebookHrefs(html)) {
    if (!isSelectorMatch(href)) continue;
    if (/comment_id=/.test(href)) continue;

    const normalized = normalizePostUrl(href);
    if (seen.has(normalized)) continue;
    if (!isFacebookPostCandidateUrl(normalized, slug)) continue;

    seen.add(normalized);
    links.push({ url: normalized, discoveredAt });
  }

  return links;
}

function main(): void {
  const runId = `evidence_repair_${nowIso().replace(/[:.]/g, '-')}_facebook`;
  let repaired = 0;

  for (const org of selectSeeds('facebook')) {
    const htmlPath = path.join(EVIDENCE_DIR, 'html', `fb_${org.organization_id}_account.html`);
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf8');
    const links = linksFromEvidence(html, orgSlug(org.account_url));
    const out = path.join(RAW_DIR, 'facebook', 'links', `${org.organization_id}.json`);
    const file: PostLinkFile = {
      run_id: runId,
      organization_id: org.organization_id,
      platform: 'facebook',
      source_url: postsListingUrl(org.account_url, 'facebook'),
      collected_at: nowIso(),
      links,
    };

    writeJsonFile(out, file);
    repaired++;
    log.info(`${org.organization_id}: repaired ${links.length} facebook post URL(s) -> ${out}`);
  }

  if (repaired === 0) log.warn('No facebook account evidence HTML files found to repair.');
}

main();
