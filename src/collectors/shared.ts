import type { Page } from 'playwright';
import { PACING, PLATFORM_PREFIX } from '../config/constants';
import type {
  AccountSnapshot,
  ExtractionStatus,
  OrgSeed,
  PostRow,
} from '../config/schema';
import { countHashtags, countMentions } from '../common/counts';
import { isInAuditWindow, nowIso } from '../common/dates';
import { captureEvidence } from '../common/evidence';
import {
  computePublicInteractions,
  engagementRatePublicPct,
  viewInteractionRatePer1000,
} from '../common/metrics';
import { normalizePostUrl, parsePostId, postTypeUrlHint } from '../common/urls';

/** What each platform extractor returns for a single post page. */
export interface ExtractedPost {
  publishedAt: string | null;
  publishedAtRaw: string | null;
  captionText: string | null;
  /** likes (Instagram) or reactions (Facebook/LinkedIn) */
  visibleLikeCount: number | null;
  visibleCommentCount: number | null;
  visibleShareCount: number | null;
  visibleViewCount: number | null;
  mediaType: string;
}

export async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(PACING.settleAfterNavMs);
}

export function evidenceTag(
  platform: PostRow['platform'],
  organizationId: string,
  suffix: string,
): string {
  return `${PLATFORM_PREFIX[platform]}_${organizationId}_${suffix}`;
}

/**
 * Assemble the flat normalized row from an extraction. Manual-coding fields are
 * always exported blank; derived metrics are computed here so every platform
 * uses the same formulas.
 */
export async function buildPostRow(args: {
  page: Page;
  org: OrgSeed;
  snapshot: AccountSnapshot | null;
  runId: string;
  rawUrl: string;
  extracted: ExtractedPost | null;
  extractionError?: string | null;
}): Promise<PostRow> {
  const { page, org, snapshot, runId, rawUrl, extracted } = args;
  const postUrl = normalizePostUrl(rawUrl);
  const postId = parsePostId(postUrl, org.platform);

  const likes = extracted?.visibleLikeCount ?? null;
  const comments = extracted?.visibleCommentCount ?? null;
  const shares = extracted?.visibleShareCount ?? null;
  const views = extracted?.visibleViewCount ?? null;
  const interactions = extracted
    ? computePublicInteractions(org.platform, { likes, comments, shares })
    : null;

  const notes: string[] = [];
  if (args.extractionError) notes.push(`extraction error: ${args.extractionError}`);
  if (extracted && likes === null) notes.push('like/reaction count hidden or not visible');
  if (extracted && extracted.publishedAt === null) notes.push('publish timestamp not visible');

  let status: ExtractionStatus;
  if (!extracted) {
    status = 'failed';
  } else if (extracted.publishedAt === null || likes === null || comments === null) {
    status = 'partial';
  } else {
    status = 'complete';
  }

  // Evidence on every partial or failed row (audit trail requirement).
  let evidenceScreenshot: string | null = null;
  if (status !== 'complete') {
    evidenceScreenshot = await captureEvidence(
      page,
      evidenceTag(org.platform, org.organization_id, postId ?? 'unknown_post'),
    );
  }

  const captionText = extracted?.captionText ?? null;

  return {
    run_id: runId,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    tier: org.tier,
    platform: org.platform,
    account_handle: org.account_handle,
    account_url: org.account_url,
    account_verified_at: snapshot?.snapshot_collected_at ?? null,
    follower_count_snapshot: snapshot?.follower_count_snapshot ?? null,
    follower_count_raw_text: snapshot?.follower_count_raw_text ?? null,
    post_url: postUrl,
    post_id: postId,
    post_type_url_hint: postTypeUrlHint(postUrl, org.platform),
    published_at: extracted?.publishedAt ?? null,
    published_at_raw: extracted?.publishedAtRaw ?? null,
    collected_at: nowIso(),
    caption_text: captionText,
    caption_length_chars: captionText === null ? null : captionText.length,
    hashtags_count: countHashtags(captionText),
    mentions_count: countMentions(captionText),
    media_type_public: extracted?.mediaType ?? 'unknown',
    visible_like_count: likes,
    visible_comment_count: comments,
    visible_share_count: shares,
    visible_view_count: views,
    public_interactions_count: interactions,
    engagement_rate_public_pct: engagementRatePublicPct(
      interactions,
      snapshot?.follower_count_snapshot ?? null,
    ),
    view_interaction_rate_per_1000: viewInteractionRatePer1000(interactions, views),
    in_june_window: isInAuditWindow(extracted?.publishedAt ?? null),
    backfill_pre_june: null,
    under_quota: null,
    ica_primary: null,
    format_coded: null,
    cta_present: null,
    cta_type: null,
    human_presence: null,
    caption_style: null,
    impact_packaging: null,
    coder_initials: null,
    qa_status: 'unchecked',
    extraction_status: status,
    evidence_screenshot: evidenceScreenshot,
    notes: notes.length > 0 ? notes.join('; ') : null,
  };
}

/** Skeleton snapshot used when account collection fails outright. */
export function failedSnapshot(
  org: OrgSeed,
  runId: string,
  error: string,
  timestamps: { iso: string; pt: string },
): AccountSnapshot {
  return {
    run_id: runId,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    tier: org.tier,
    platform: org.platform,
    account_handle: org.account_handle,
    account_url: org.account_url,
    public_access: false,
    follower_count_snapshot: null,
    follower_count_raw_text: null,
    post_count_snapshot: null,
    account_bio: null,
    category_text: null,
    last_visible_post_date: null,
    verified_badge_present: null,
    snapshot_collected_at: timestamps.iso,
    snapshot_collected_at_pt: timestamps.pt,
    extraction_status: 'failed',
    evidence_screenshot: null,
    notes: `collection failed: ${error}`,
  };
}
