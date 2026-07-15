import { POSTS_JSON } from '../src/config/constants';
import type { PostRow } from '../src/config/schema';
import { auditWindowLabel, isInAuditWindow } from '../src/common/dates';
import { log } from '../src/common/logger';
import { mergeAndSavePostRows, readJsonFile } from '../src/common/store';

function main(): void {
  const rows = readJsonFile<PostRow[]>(POSTS_JSON, []);
  if (rows.length === 0) {
    log.warn('No normalized post rows found.');
    return;
  }

  let changed = 0;
  const updated = rows.map((row) => {
    const inWindow = isInAuditWindow(row.published_at);
    if (row.in_june_window !== inWindow) changed++;
    return { ...row, in_june_window: inWindow };
  });

  mergeAndSavePostRows(updated);
  log.info(`Recomputed audit-window flags for ${rows.length} rows (${changed} changed).`);
  log.info(`Audit window: ${auditWindowLabel}`);
}

main();
