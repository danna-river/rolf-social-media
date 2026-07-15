import type { Page } from 'playwright';
import type { AccountSnapshot, OrgSeed } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { nowIso, nowPtDisplay } from '../common/dates';
import { captureEvidence } from '../common/evidence';
import { evidenceTag, gotoAndSettle } from './shared';

/**
 * One account-level snapshot per Instagram profile. All numbers are parsed
 * from visible text with the raw display text preserved alongside.
 */
export async function collectInstagramAccountSnapshot(
  page: Page,
  org: OrgSeed,
  runId: string,
): Promise<AccountSnapshot> {
  const tag = evidenceTag('instagram', org.organization_id, 'account');
  await gotoAndSettle(page, org.account_url);
  await assertNoChallenge(page, 'instagram', tag);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const headerText = await page
    .locator('header')
    .first()
    .innerText()
    .catch(() => null);
  const source = headerText ?? bodyText;

  const followersRaw = source.match(/([\d.,]+(?:\s*[KMB])?)\s+followers/i)?.[1] ?? null;
  const postsRaw = source.match(/([\d.,]+(?:\s*[KMB])?)\s+posts/i)?.[1] ?? null;
  const isPrivate = /this account is private/i.test(bodyText);
  const verified = await page
    .locator('svg[aria-label="Verified"]')
    .first()
    .isVisible()
    .catch(() => false);

  const screenshot = await captureEvidence(page, tag);

  const notes: string[] = [];
  if (isPrivate) notes.push('account is private');
  if (followersRaw === null) notes.push('follower count not found in header text');

  return {
    run_id: runId,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    tier: org.tier,
    platform: 'instagram',
    account_handle: org.account_handle,
    account_url: org.account_url,
    public_access: !isPrivate,
    follower_count_snapshot: parseCompactCount(followersRaw),
    follower_count_raw_text: followersRaw ? `${followersRaw} followers` : null,
    post_count_snapshot: parseCompactCount(postsRaw),
    account_bio: headerText ? headerText.slice(0, 1000) : null,
    category_text: null,
    last_visible_post_date: null,
    verified_badge_present: verified,
    snapshot_collected_at: nowIso(),
    snapshot_collected_at_pt: nowPtDisplay(),
    extraction_status: followersRaw !== null ? 'complete' : 'partial',
    evidence_screenshot: screenshot,
    notes: notes.length > 0 ? notes.join('; ') : null,
  };
}
