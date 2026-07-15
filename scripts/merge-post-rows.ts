import path from 'node:path';
import { POSTS_JSON } from '../src/config/constants';
import type { PostRow } from '../src/config/schema';
import { log } from '../src/common/logger';
import { mergeAndSavePostRows, readJsonFile } from '../src/common/store';

function main(): void {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error('Usage: npx tsx scripts/merge-post-rows.ts <posts_public_metrics.json> [...]');
  }

  const incoming: PostRow[] = [];
  for (const file of files) {
    const resolved = path.resolve(file);
    const rows = readJsonFile<PostRow[]>(resolved, []);
    incoming.push(...rows);
    log.info(`Loaded ${rows.length} row(s) from ${resolved}`);
  }

  if (incoming.length === 0) {
    log.warn('No incoming rows found.');
    return;
  }

  mergeAndSavePostRows(incoming);
  log.info(`Merged ${incoming.length} incoming row(s) into ${POSTS_JSON}`);
}

main();
