export type Platform = 'instagram' | 'facebook' | 'linkedin';

export type Tier =
  | 'focal_org'
  | 'south_bay_local'
  | 'ca_regional'
  | 'national_faith_adjacent';

export type ExtractionStatus = 'complete' | 'partial' | 'failed';

/** One row per organization-platform combination in data/seeds/organizations.csv. */
export interface OrgSeed {
  organization_id: string;
  organization_name: string;
  tier: Tier | string;
  platform: Platform;
  account_handle: string;
  account_url: string;
  active: boolean;
  notes: string | null;
}

/** Account-level verification snapshot, collected once per org-platform on a single day. */
export interface AccountSnapshot {
  run_id: string;
  organization_id: string;
  organization_name: string;
  tier: string;
  platform: Platform;
  account_handle: string;
  account_url: string;
  public_access: boolean;
  follower_count_snapshot: number | null;
  follower_count_raw_text: string | null;
  post_count_snapshot: number | null;
  account_bio: string | null;
  category_text: string | null;
  last_visible_post_date: string | null;
  verified_badge_present: boolean | null;
  snapshot_collected_at: string;
  snapshot_collected_at_pt: string;
  extraction_status: ExtractionStatus;
  evidence_screenshot: string | null;
  notes: string | null;
}

/** A post URL discovered during enumeration, before metrics extraction. */
export interface PostLink {
  url: string;
  discoveredAt: string;
}

export interface PostLinkFile {
  run_id: string;
  organization_id: string;
  platform: Platform;
  source_url: string;
  collected_at: string;
  links: PostLink[];
}

/** Flat row-per-post schema. Maps 1:1 to the workbook columns. */
export interface PostRow {
  run_id: string;
  organization_id: string;
  organization_name: string;
  tier: string;
  platform: Platform;
  account_handle: string;
  account_url: string;
  account_verified_at: string | null;
  follower_count_snapshot: number | null;
  follower_count_raw_text: string | null;
  post_url: string;
  post_id: string | null;
  post_type_url_hint: string | null;
  published_at: string | null;
  published_at_raw: string | null;
  collected_at: string;
  caption_text: string | null;
  caption_length_chars: number | null;
  hashtags_count: number | null;
  mentions_count: number | null;
  media_type_public: string;
  visible_like_count: number | null;
  visible_comment_count: number | null;
  visible_share_count: number | null;
  visible_view_count: number | null;
  public_interactions_count: number | null;
  engagement_rate_public_pct: number | null;
  view_interaction_rate_per_1000: number | null;
  in_june_window: boolean | null;
  backfill_pre_june: boolean | null;
  under_quota: boolean | null;
  // Manual coding fields — always exported blank by collectors; filled by the human coder.
  ica_primary: string | null;
  format_coded: string | null;
  cta_present: boolean | null;
  cta_type: string | null;
  human_presence: string | null;
  caption_style: string | null;
  impact_packaging: string | null;
  coder_initials: string | null;
  qa_status: string;
  extraction_status: ExtractionStatus;
  evidence_screenshot: string | null;
  notes: string | null;
}

export interface ValidationError {
  rowKey: string;
  severity: 'warning' | 'error';
  field: string;
  message: string;
}

export interface ValidationReport {
  generated_at: string;
  total_rows: number;
  rows_with_errors: number;
  rows_with_warnings: number;
  duplicates_dropped: number;
  errors: ValidationError[];
  warnings: ValidationError[];
}
