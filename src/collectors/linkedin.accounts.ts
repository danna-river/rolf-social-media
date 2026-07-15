import type { Page } from 'playwright';
import type { AccountSnapshot, OrgSeed } from '../config/schema';
import { assertNoChallenge } from '../common/challenge';
import { parseCompactCount } from '../common/counts';
import { nowIso, nowPtDisplay } from '../common/dates';
import { captureEvidence } from '../common/evidence';
import { evidenceTag, gotoAndSettle } from './shared';

/**
 * LinkedIn is manual-first (see enforceLinkedInPolicy). This collector runs only
 * when the operator explicitly accepted the policy risk.
 */
export async function collectLinkedInAccountSnapshot(
  page: Page,
  org: OrgSeed,
  runId: string,
): Promise<AccountSnapshot> {
  const tag = evidenceTag('linkedin', org.organization_id, 'account');
  await gotoAndSettle(page, org.account_url);
  await assertNoChallenge(page, 'linkedin', tag);

  const bodyText = await page.locator('body').innerText().catch(() => '');

  const followersRaw = bodyText.match(/([\d.,]+(?:\s*[KMB])?)\s+followers/i)?.[1] ?? null;
  const employeesRaw =
    bodyText.match(/([\d.,]+(?:[-–][\d.,]+)?(?:\s*[KMB])?\+?)\s+employees/i)?.[1] ?? null;
  const industryMatch = bodyText.match(
    /(non-?profit organizations?|philanthropy|civic and social organizations?|religious institutions?)/i,
  );

  const screenshot = await captureEvidence(page, tag);

  return {
    run_id: runId,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    tier: org.tier,
    platform: 'linkedin',
    account_handle: org.account_handle,
    account_url: org.account_url,
    public_access: true,
    follower_count_snapshot: parseCompactCount(followersRaw),
    follower_count_raw_text: followersRaw ? `${followersRaw} followers` : null,
    post_count_snapshot: null,
    account_bio: employeesRaw ? `employees: ${employeesRaw}` : null,
    category_text: industryMatch?.[1] ?? null,
    last_visible_post_date: null,
    verified_badge_present: null,
    snapshot_collected_at: nowIso(),
    snapshot_collected_at_pt: nowPtDisplay(),
    extraction_status: followersRaw !== null ? 'complete' : 'partial',
    evidence_screenshot: screenshot,
    notes: followersRaw === null ? 'follower count not found in page text' : null,
  };
}
