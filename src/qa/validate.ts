import type { PostRow, ValidationError, ValidationReport } from '../config/schema';
import { auditWindowLabel, isInAuditWindow, nowIso } from '../common/dates';
import {
  CAPTION_STYLE_VALUES,
  CTA_TYPE_VALUES,
  FORMAT_CODED_VALUES,
  HUMAN_PRESENCE_VALUES,
  ICA_PRIMARY_VALUES,
  IMPACT_PACKAGING_VALUES,
} from '../export/workbook-map';

const COUNT_FIELDS = [
  'follower_count_snapshot',
  'visible_like_count',
  'visible_comment_count',
  'visible_share_count',
  'visible_view_count',
  'public_interactions_count',
] as const;

const VOCAB_FIELDS: Array<{ field: keyof PostRow; values: readonly string[] }> = [
  { field: 'ica_primary', values: ICA_PRIMARY_VALUES },
  { field: 'format_coded', values: FORMAT_CODED_VALUES },
  { field: 'cta_type', values: CTA_TYPE_VALUES },
  { field: 'human_presence', values: HUMAN_PRESENCE_VALUES },
  { field: 'caption_style', values: CAPTION_STYLE_VALUES },
  { field: 'impact_packaging', values: IMPACT_PACKAGING_VALUES },
];

export function validateRow(row: PostRow): ValidationError[] {
  const errs: ValidationError[] = [];
  const key = `${row.platform}::${row.post_url}`;
  const err = (field: string, message: string, severity: 'error' | 'warning' = 'error') =>
    errs.push({ rowKey: key, severity, field, message });

  // Completeness
  if (!row.organization_id) err('organization_id', 'Missing organization_id');
  if (!row.platform) err('platform', 'Missing platform');
  if (!row.post_url) err('post_url', 'Missing post_url');
  if (!row.run_id) err('run_id', 'Missing run_id', 'warning');

  // Type + range validation: count fields must be non-negative integers or null
  for (const f of COUNT_FIELDS) {
    const v = row[f];
    if (v !== null && v !== undefined && (!Number.isInteger(v) || v < 0)) {
      err(f, 'Must be a non-negative integer or null');
    }
  }

  // URL normalization sanity
  if (row.post_url && !/^https:\/\//.test(row.post_url)) {
    err('post_url', 'post_url is not a canonical https URL', 'warning');
  }
  if (row.post_url && /[?&](utm_|fbclid|igsh)/.test(row.post_url)) {
    err('post_url', 'post_url still carries tracking params', 'warning');
  }

  // Date-window validation: published in the audit window, flagged backfill, or explained.
  const inWindow = isInAuditWindow(row.published_at);
  if (row.published_at === null) {
    err('published_at', 'Publish timestamp missing (verify manually)', 'warning');
  } else if (inWindow === false && row.backfill_pre_june !== true) {
    err(
      'published_at',
      `Outside audit window (${auditWindowLabel}) and not flagged backfill_pre_june`,
      'warning',
    );
  }

  // Engagement sanity: not absurdly high without review
  if (row.engagement_rate_public_pct !== null && row.engagement_rate_public_pct > 50) {
    err(
      'engagement_rate_public_pct',
      `Engagement rate ${row.engagement_rate_public_pct}% is unusually high — review row`,
      'warning',
    );
  }

  // Hidden-metric convention: null counts need a reason note
  if (
    row.extraction_status !== 'failed' &&
    row.visible_like_count === null &&
    !row.notes
  ) {
    err('visible_like_count', 'Null like/reaction count with no reason note', 'warning');
  }

  // Workbook-fit: categorical labels must exactly match dropdown values
  for (const { field, values } of VOCAB_FIELDS) {
    const v = row[field];
    if (v !== null && v !== undefined && typeof v === 'string' && !values.includes(v)) {
      err(field, `"${v}" is not a workbook dropdown value (${values.join(' | ')})`);
    }
  }

  return errs;
}

export function validateDataset(
  rows: PostRow[],
  duplicatesDropped: number,
): ValidationReport {
  const all = rows.flatMap(validateRow);
  const errors = all.filter((e) => e.severity === 'error');
  const warnings = all.filter((e) => e.severity === 'warning');
  return {
    generated_at: nowIso(),
    total_rows: rows.length,
    rows_with_errors: new Set(errors.map((e) => e.rowKey)).size,
    rows_with_warnings: new Set(warnings.map((e) => e.rowKey)).size,
    duplicates_dropped: duplicatesDropped,
    errors,
    warnings,
  };
}
