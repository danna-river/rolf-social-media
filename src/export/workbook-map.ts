import type { PostRow, AccountSnapshot } from '../config/schema';

/**
 * Label vocabularies — must stay aligned with the workbook dropdowns.
 * If the workbook changes, change these in one place and re-run validation.
 */
export const ICA_PRIMARY_VALUES = ['Information', 'Community', 'Action'] as const;

export const FORMAT_CODED_VALUES = [
  'image',
  'carousel',
  'reel/video',
  'link',
  'album',
  'document',
  'text-only',
  'other',
] as const;

export const CTA_TYPE_VALUES = [
  'donate',
  'volunteer',
  'register/attend',
  'learn more',
  'share',
  'comment',
  'follow',
  'contact',
  'none',
] as const;

export const HUMAN_PRESENCE_VALUES = [
  'none',
  'staff',
  'volunteer',
  'participant/client',
  'group',
  'mixed',
  'unclear',
] as const;

export const CAPTION_STYLE_VALUES = [
  'informational',
  'storytelling',
  'testimonial',
  'gratitude',
  'announcement',
  'urgency',
  'impact-reporting',
  'advocacy',
  'other',
] as const;

export const IMPACT_PACKAGING_VALUES = [
  'story_only',
  'numbers_only',
  'story_plus_numbers',
  'direct_ask',
  'community-centered',
  'other',
] as const;

/** Column order for the post CSV exports and the coding sheet. */
export const POST_COLUMNS: Array<keyof PostRow> = [
  'run_id',
  'organization_id',
  'organization_name',
  'tier',
  'platform',
  'account_handle',
  'account_url',
  'account_verified_at',
  'follower_count_snapshot',
  'follower_count_raw_text',
  'post_url',
  'post_id',
  'post_type_url_hint',
  'published_at',
  'published_at_raw',
  'collected_at',
  'caption_text',
  'caption_length_chars',
  'hashtags_count',
  'mentions_count',
  'media_type_public',
  'visible_like_count',
  'visible_comment_count',
  'visible_share_count',
  'visible_view_count',
  'public_interactions_count',
  'engagement_rate_public_pct',
  'view_interaction_rate_per_1000',
  'in_june_window',
  'backfill_pre_june',
  'under_quota',
  'ica_primary',
  'format_coded',
  'cta_present',
  'cta_type',
  'human_presence',
  'caption_style',
  'impact_packaging',
  'coder_initials',
  'qa_status',
  'extraction_status',
  'evidence_screenshot',
  'notes',
];

/** Column order for account_snapshots.csv. */
export const ACCOUNT_COLUMNS: Array<keyof AccountSnapshot> = [
  'run_id',
  'organization_id',
  'organization_name',
  'tier',
  'platform',
  'account_handle',
  'account_url',
  'public_access',
  'follower_count_snapshot',
  'follower_count_raw_text',
  'post_count_snapshot',
  'account_bio',
  'category_text',
  'last_visible_post_date',
  'verified_badge_present',
  'snapshot_collected_at',
  'snapshot_collected_at_pt',
  'extraction_status',
  'evidence_screenshot',
  'notes',
];
