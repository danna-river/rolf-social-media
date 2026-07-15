import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, POSTS_JSON } from '../src/config/constants';
import type { ExtractionStatus, PostRow } from '../src/config/schema';
import { nowIso } from '../src/common/dates';
import { applyDerivedMetrics } from '../src/common/metrics';
import { log } from '../src/common/logger';
import { mergeAndSavePostRows, readJsonFile } from '../src/common/store';
import { extractFacebookEmbeddedPostMetrics } from '../src/collectors/facebook.posts';

function statusFor(row: PostRow): ExtractionStatus {
  if (row.published_at === null || row.visible_like_count === null || row.visible_comment_count === null) {
    return 'partial';
  }
  return 'complete';
}

function main(): void {
  const rows = readJsonFile<PostRow[]>(POSTS_JSON, []);
  const candidates = rows.filter((row) => row.platform === 'facebook');
  if (candidates.length === 0) {
    log.info('No facebook rows to repair.');
    return;
  }

  const repaired: PostRow[] = [];
  let noEvidence = 0;
  let noEmbedded = 0;

  for (const row of candidates) {
    const htmlPath = path.join(
      EVIDENCE_DIR,
      'html',
      `fb_${row.organization_id}_${row.post_id ?? 'unknown_post'}.html`,
    );
    if (!fs.existsSync(htmlPath)) {
      noEvidence++;
      continue;
    }

    const html = fs.readFileSync(htmlPath, 'utf8');
    const embedded = extractFacebookEmbeddedPostMetrics(html, row.post_url);
    if (
      embedded.publishedAt === null &&
      embedded.reactions === null &&
      embedded.comments === null &&
      embedded.shares === null
    ) {
      noEmbedded++;
      continue;
    }

    const updated = applyDerivedMetrics({
      ...row,
      published_at: embedded.publishedAt ?? row.published_at,
      published_at_raw: embedded.publishedAtRaw ?? row.published_at_raw,
      visible_like_count: embedded.reactions ?? row.visible_like_count,
      visible_comment_count: embedded.comments ?? row.visible_comment_count,
      visible_share_count: embedded.shares ?? row.visible_share_count,
      notes: `repaired from evidence html ${nowIso()} (facebook embedded payload)`,
    });

    repaired.push({
      ...updated,
      extraction_status: statusFor(updated),
    });
  }

  if (repaired.length > 0) mergeAndSavePostRows(repaired);
  log.info(
    `Repaired ${repaired.length}/${candidates.length} facebook rows` +
      (noEvidence > 0 ? `; ${noEvidence} had no evidence html` : '') +
      (noEmbedded > 0 ? `; ${noEmbedded} had no parsable embedded payload` : ''),
  );
}

main();
