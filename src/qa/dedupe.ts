import type { PostRow } from '../config/schema';
import { postKey } from '../common/store';

/**
 * Duplicate detection on the unique key platform + post_url.
 * Prefers the row with the more complete extraction when keys collide.
 */
export function dedupePostRows(rows: PostRow[]): { rows: PostRow[]; dropped: PostRow[] } {
  const rank = { complete: 2, partial: 1, failed: 0 } as const;
  const byKey = new Map<string, PostRow>();
  const dropped: PostRow[] = [];

  for (const row of rows) {
    const key = postKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
    } else if (rank[row.extraction_status] > rank[existing.extraction_status]) {
      dropped.push(existing);
      byKey.set(key, row);
    } else {
      dropped.push(row);
    }
  }
  return { rows: [...byKey.values()], dropped };
}
