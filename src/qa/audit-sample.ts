import type { PostRow } from '../config/schema';
import { postKey } from '../common/store';

/**
 * Deterministic ~10% audit sample: sort by stable key, take every Nth row.
 * The reviewer checks each sampled row against the live page / evidence
 * screenshot before workbook import.
 */
export function selectAuditSample(rows: PostRow[], fraction = 0.1): PostRow[] {
  if (rows.length === 0 || fraction <= 0) return [];
  const sorted = [...rows].sort((a, b) => postKey(a).localeCompare(postKey(b)));
  const step = Math.max(1, Math.round(1 / fraction));
  return sorted.filter((_, idx) => idx % step === 0);
}
