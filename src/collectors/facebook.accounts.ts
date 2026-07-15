import type { Page } from 'playwright';
import type { AccountSnapshot, OrgSeed } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { nowIso, nowPtDisplay } from '../common/dates';
import { captureEvidence } from '../common/evidence';
import { evidenceTag, gotoAndSettle } from './shared';

export async function collectFacebookAccountSnapshot(
  page: Page,
  org: OrgSeed,
  runId: string,
): Promise<AccountSnapshot> {
  const tag = evidenceTag('facebook', org.organization_id, 'account');
  await gotoAndSettle(page, org.account_url);
  await assertNoChallenge(page, 'facebook', tag);

  const bodyText = await page.locator('body').innerText().catch(() => '');

  const followersRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+followers/i)?.[1] ?? null;
  const likesRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+likes/i)?.[1] ?? null;
  // Page category usually appears near the top, e.g. "Nonprofit organization".
  const categoryMatch = bodyText.match(
    /(nonprofit organization|charity organization|religious organization|community organization|community service)/i,
  );
  const unavailable = /this content isn'?t available|page not found/i.test(bodyText);

  const screenshot = await captureEvidence(page, tag);

  const notes: string[] = [];
  if (unavailable) notes.push('page unavailable or renamed');
  if (followersRaw === null) notes.push('follower count not found in page text');

  return {
    run_id: runId,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    tier: org.tier,
    platform: 'facebook',
    account_handle: org.account_handle,
    account_url: org.account_url,
    public_access: !unavailable,
    follower_count_snapshot: parseCompactCount(followersRaw),
    follower_count_raw_text: followersRaw ? `${followersRaw} followers` : null,
    post_count_snapshot: parseCompactCount(likesRaw), // page likes; FB shows no post count
    account_bio: null,
    category_text: categoryMatch?.[1] ?? null,
    last_visible_post_date: null,
    verified_badge_present: null,
    snapshot_collected_at: nowIso(),
    snapshot_collected_at_pt: nowPtDisplay(),
    extraction_status: followersRaw !== null ? 'complete' : 'partial',
    evidence_screenshot: screenshot,
    notes:
      (notes.length > 0 ? notes.join('; ') + '; ' : '') +
      'post_count_snapshot column holds page likes for facebook',
  };
}
