/**
 * Re-extract Instagram metrics from the HTML evidence saved during a collection
 * run, without revisiting any live pages. Used after the 2026-07-14 pilot showed
 * Instagram no longer renders "N likes" in visible body text — the counts live
 * in the og:description meta tag and the caption in embedded JSON, both of which
 * are present in the saved evidence files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, POSTS_JSON } from '../src/config/constants';
import type { PostRow } from '../src/config/schema';
import { parseCompactCount } from '../src/common/counts';
import { isInAuditWindow, nowIso } from '../src/common/dates';
import { log } from '../src/common/logger';
import {
  computePublicInteractions,
  engagementRatePublicPct,
  viewInteractionRatePer1000,
} from '../src/common/metrics';
import { mergeAndSavePostRows, readJsonFile } from '../src/common/store';
import {
  extractInstagramEmbeddedCaption,
  extractMetaDescriptionFromHtml,
  parseInstagramMetaDescription,
} from '../src/collectors/instagram.meta';

function main(): void {
  const rows = readJsonFile<PostRow[]>(POSTS_JSON, []);
  const candidates = rows.filter(
    (r) => r.platform === 'instagram' && r.extraction_status !== 'complete',
  );
  if (candidates.length === 0) {
    log.info('No partial/failed instagram rows to repair.');
    return;
  }

  const repaired: PostRow[] = [];
  let noEvidence = 0;
  let noMeta = 0;

  for (const row of candidates) {
    const htmlPath = path.join(
      EVIDENCE_DIR,
      'html',
      `ig_${row.organization_id}_${row.post_id ?? 'unknown_post'}.html`,
    );
    if (!fs.existsSync(htmlPath)) {
      noEvidence++;
      continue;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const meta = parseInstagramMetaDescription(extractMetaDescriptionFromHtml(html));
    if (meta.likesRaw === null && meta.commentsRaw === null) {
      noMeta++;
      continue;
    }

    // The meta description is authoritative for this post — it overrides any
    // earlier body-text regex mis-hits, not just nulls.
    const likes = parseCompactCount(meta.likesRaw);
    const comments = parseCompactCount(meta.commentsRaw);
    const caption =
      extractInstagramEmbeddedCaption(html) ?? meta.captionStart ?? row.caption_text;
    const interactions = computePublicInteractions('instagram', {
      likes,
      comments,
      shares: null,
    });
    const isCarousel =
      row.media_type_public === 'image_or_unknown' && html.includes('aria-label="Next"');

    const updated: PostRow = {
      ...row,
      visible_like_count: likes,
      visible_comment_count: comments,
      caption_text: caption,
      caption_length_chars: caption === null ? null : caption.length,
      hashtags_count: caption === null ? null : (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
      mentions_count: caption === null ? null : (caption.match(/@[A-Za-z0-9._]+/g) ?? []).length,
      published_at_raw: row.published_at_raw ?? meta.dateRaw,
      media_type_public: isCarousel ? 'carousel' : row.media_type_public,
      public_interactions_count: interactions,
      engagement_rate_public_pct: engagementRatePublicPct(
        interactions,
        row.follower_count_snapshot,
      ),
      view_interaction_rate_per_1000: viewInteractionRatePer1000(
        interactions,
        row.visible_view_count,
      ),
      in_june_window: isInAuditWindow(row.published_at),
      extraction_status:
        row.published_at !== null && likes !== null && comments !== null
          ? 'complete'
          : 'partial',
      notes: `repaired from evidence html ${nowIso()} (meta og:description)`,
    };
    repaired.push(updated);
  }

  if (repaired.length > 0) mergeAndSavePostRows(repaired);
  log.info(
    `Repaired ${repaired.length}/${candidates.length} rows` +
      (noEvidence > 0 ? `; ${noEvidence} had no evidence html` : '') +
      (noMeta > 0 ? `; ${noMeta} had no parsable meta description` : ''),
  );
}

main();
