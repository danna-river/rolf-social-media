import type { Platform, PostRow } from '../config/schema';
import { countHashtags, countMentions } from './counts';
import { isInJuneWindow } from './dates';

/**
 * Platform-aware public interactions:
 *   Instagram: likes + comments
 *   Facebook:  reactions + comments + shares_visible
 *   LinkedIn:  reactions + comments + reposts_visible
 *
 * If the core signal (likes/reactions) is hidden, the numerator is incomplete —
 * return null and exclude the row from rate formulas rather than guessing.
 * Missing secondary counts (shares not shown) are treated as 0-visible.
 */
export function computePublicInteractions(
  platform: Platform,
  counts: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
  },
): number | null {
  const { likes, comments, shares } = counts;
  if (likes === null && comments === null) return null;
  if (likes === null) return null; // hidden like/reaction counts → incomplete numerator
  const base = likes + (comments ?? 0);
  if (platform === 'instagram') return base;
  return base + (shares ?? 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function engagementRatePublicPct(
  interactions: number | null,
  followers: number | null,
): number | null {
  if (interactions === null || followers === null || followers <= 0) return null;
  return round2((interactions / followers) * 100);
}

export function viewInteractionRatePer1000(
  interactions: number | null,
  views: number | null,
): number | null {
  if (interactions === null || views === null || views <= 0) return null;
  return round2((interactions / views) * 1000);
}

/**
 * Fill derived fields that are null but computable from what the row already
 * has. Used for hand-entered rows (manual_posts.csv) so the manual coder only
 * records raw visible counts; never overwrites a value that is already set.
 */
export function applyDerivedMetrics(row: PostRow): PostRow {
  const interactions =
    row.public_interactions_count ??
    computePublicInteractions(row.platform, {
      likes: row.visible_like_count,
      comments: row.visible_comment_count,
      shares: row.visible_share_count,
    });
  return {
    ...row,
    public_interactions_count: interactions,
    engagement_rate_public_pct:
      row.engagement_rate_public_pct ??
      engagementRatePublicPct(interactions, row.follower_count_snapshot),
    view_interaction_rate_per_1000:
      row.view_interaction_rate_per_1000 ??
      viewInteractionRatePer1000(interactions, row.visible_view_count),
    in_june_window: row.in_june_window ?? isInJuneWindow(row.published_at),
    caption_length_chars:
      row.caption_length_chars ?? (row.caption_text === null ? null : row.caption_text.length),
    hashtags_count: row.hashtags_count ?? countHashtags(row.caption_text),
    mentions_count: row.mentions_count ?? countMentions(row.caption_text),
  };
}
