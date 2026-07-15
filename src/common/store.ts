import fs from 'node:fs';
import path from 'node:path';
import {
  ACCOUNT_SNAPSHOTS_CSV,
  MANUAL_POSTS_CSV,
  POSTS_CSV,
  POSTS_JSON,
} from '../config/constants';
import type {
  AccountSnapshot,
  ExtractionStatus,
  Platform,
  PostRow,
} from '../config/schema';
import { readCsv, writeCsv } from './csv';
import { ACCOUNT_COLUMNS, POST_COLUMNS } from '../export/workbook-map';
import { log } from './logger';
import { applyDerivedMetrics } from './metrics';

export function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function postKey(row: Pick<PostRow, 'platform' | 'post_url'>): string {
  return `${row.platform}::${row.post_url}`;
}

// ---------- account snapshots ----------

function coerceInt(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function coerceFloat(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceBool(v: string | undefined): boolean | null {
  if (v === undefined || v.trim() === '') return null;
  return /^(true|1|yes|y)$/i.test(v.trim());
}

function coerceStr(v: string | undefined): string | null {
  if (v === undefined || v.trim() === '') return null;
  return v;
}

export function loadSnapshots(): AccountSnapshot[] {
  return readCsv(ACCOUNT_SNAPSHOTS_CSV).map((r) => ({
    run_id: r.run_id ?? '',
    organization_id: r.organization_id ?? '',
    organization_name: r.organization_name ?? '',
    tier: r.tier ?? '',
    platform: (r.platform ?? '') as Platform,
    account_handle: r.account_handle ?? '',
    account_url: r.account_url ?? '',
    public_access: coerceBool(r.public_access) ?? true,
    follower_count_snapshot: coerceInt(r.follower_count_snapshot),
    follower_count_raw_text: coerceStr(r.follower_count_raw_text),
    post_count_snapshot: coerceInt(r.post_count_snapshot),
    account_bio: coerceStr(r.account_bio),
    category_text: coerceStr(r.category_text),
    last_visible_post_date: coerceStr(r.last_visible_post_date),
    verified_badge_present: coerceBool(r.verified_badge_present),
    snapshot_collected_at: r.snapshot_collected_at ?? '',
    snapshot_collected_at_pt: r.snapshot_collected_at_pt ?? '',
    extraction_status: (r.extraction_status ?? 'partial') as ExtractionStatus,
    evidence_screenshot: coerceStr(r.evidence_screenshot),
    notes: coerceStr(r.notes),
  }));
}

/** Replace rows for the same platform+organization, keep everything else. */
export function mergeAndSaveSnapshots(incoming: AccountSnapshot[]): void {
  const replaced = new Set(incoming.map((s) => `${s.platform}::${s.organization_id}`));
  const kept = loadSnapshots().filter(
    (s) => !replaced.has(`${s.platform}::${s.organization_id}`),
  );
  const all = [...kept, ...incoming];
  writeCsv(
    ACCOUNT_SNAPSHOTS_CSV,
    all as unknown as Array<Record<string, unknown>>,
    ACCOUNT_COLUMNS as unknown as string[],
  );
  log.info(`Saved ${all.length} account snapshot rows → ${ACCOUNT_SNAPSHOTS_CSV}`);
}

export function snapshotFor(
  snapshots: AccountSnapshot[],
  platform: Platform,
  organizationId: string,
): AccountSnapshot | null {
  return (
    snapshots.find(
      (s) => s.platform === platform && s.organization_id === organizationId,
    ) ?? null
  );
}

// ---------- post rows ----------

function coercePostRecord(r: Record<string, string>): PostRow {
  return {
    run_id: r.run_id ?? '',
    organization_id: r.organization_id ?? '',
    organization_name: r.organization_name ?? '',
    tier: r.tier ?? '',
    platform: (r.platform ?? '') as Platform,
    account_handle: r.account_handle ?? '',
    account_url: r.account_url ?? '',
    account_verified_at: coerceStr(r.account_verified_at),
    follower_count_snapshot: coerceInt(r.follower_count_snapshot),
    follower_count_raw_text: coerceStr(r.follower_count_raw_text),
    post_url: r.post_url ?? '',
    post_id: coerceStr(r.post_id),
    post_type_url_hint: coerceStr(r.post_type_url_hint),
    published_at: coerceStr(r.published_at),
    published_at_raw: coerceStr(r.published_at_raw),
    collected_at: r.collected_at ?? '',
    caption_text: coerceStr(r.caption_text),
    caption_length_chars: coerceInt(r.caption_length_chars),
    hashtags_count: coerceInt(r.hashtags_count),
    mentions_count: coerceInt(r.mentions_count),
    media_type_public: r.media_type_public ?? 'unknown',
    visible_like_count: coerceInt(r.visible_like_count),
    visible_comment_count: coerceInt(r.visible_comment_count),
    visible_share_count: coerceInt(r.visible_share_count),
    visible_view_count: coerceInt(r.visible_view_count),
    public_interactions_count: coerceInt(r.public_interactions_count),
    engagement_rate_public_pct: coerceFloat(r.engagement_rate_public_pct),
    view_interaction_rate_per_1000: coerceFloat(r.view_interaction_rate_per_1000),
    in_june_window: coerceBool(r.in_june_window),
    backfill_pre_june: coerceBool(r.backfill_pre_june),
    under_quota: coerceBool(r.under_quota),
    ica_primary: coerceStr(r.ica_primary),
    format_coded: coerceStr(r.format_coded),
    cta_present: coerceBool(r.cta_present),
    cta_type: coerceStr(r.cta_type),
    human_presence: coerceStr(r.human_presence),
    caption_style: coerceStr(r.caption_style),
    impact_packaging: coerceStr(r.impact_packaging),
    coder_initials: coerceStr(r.coder_initials),
    qa_status: r.qa_status ?? 'unchecked',
    extraction_status: (r.extraction_status ?? 'partial') as ExtractionStatus,
    evidence_screenshot: coerceStr(r.evidence_screenshot),
    notes: coerceStr(r.notes),
  };
}

/**
 * Load all post rows: the normalized JSON store plus any manually collected
 * rows in data/normalized/manual_posts.csv (LinkedIn manual-first path).
 * Automated rows win on duplicate platform+post_url keys.
 */
export function loadPostRows(): PostRow[] {
  const automated = readJsonFile<PostRow[]>(POSTS_JSON, []);
  // Manual rows get derived metrics computed here so the hand-entry template
  // only needs raw visible counts + follower snapshot.
  const manual = readCsv(MANUAL_POSTS_CSV).map((r) =>
    applyDerivedMetrics(coercePostRecord(r)),
  );
  const seen = new Set(automated.map(postKey));
  const merged = [...automated];
  for (const row of manual) {
    if (!row.post_url) continue;
    if (!seen.has(postKey(row))) {
      merged.push(row);
      seen.add(postKey(row));
    }
  }
  return merged;
}

/** Replace rows with the same platform+post_url, keep everything else, write JSON + CSV. */
export function mergeAndSavePostRows(incoming: PostRow[]): void {
  const replaced = new Set(incoming.map(postKey));
  const kept = readJsonFile<PostRow[]>(POSTS_JSON, []).filter(
    (row) => !replaced.has(postKey(row)),
  );
  const all = [...kept, ...incoming];
  writeJsonFile(POSTS_JSON, all);
  writeCsv(
    POSTS_CSV,
    all as unknown as Array<Record<string, unknown>>,
    POST_COLUMNS as unknown as string[],
  );
  log.info(`Saved ${all.length} post rows → ${POSTS_JSON} / ${POSTS_CSV}`);
}
