import { CODING_SHEET_CSV, SAMPLING } from '../src/config/constants';
import type { Platform, PostRow } from '../src/config/schema';
import { isInJuneWindow } from '../src/common/dates';
import { log } from '../src/common/logger';
import { loadPostRows } from '../src/common/store';
import { exportPostsCsv } from '../src/export/to-csv';
import { dedupePostRows } from '../src/qa/dedupe';

const FOCAL_ORG_ID = 'rolf';

function publishedMs(row: PostRow): number {
  const t = row.published_at ? Date.parse(row.published_at) : NaN;
  return Number.isNaN(t) ? -Infinity : t; // unknown dates sort oldest
}

function newestFirst(rows: PostRow[]): PostRow[] {
  return [...rows].sort((a, b) => publishedMs(b) - publishedMs(a));
}

/** Evenly spaced (systematic) pick of k rows from a newest-first list. */
function systematicPick(rows: PostRow[], k: number): PostRow[] {
  if (k >= rows.length) return [...rows];
  const picked: PostRow[] = [];
  for (let i = 0; i < k; i++) {
    picked.push(rows[Math.floor((i * rows.length) / k)]!);
  }
  return picked;
}

/**
 * Peer quota: 15–20 posts per organization total, allocated proportionally by
 * June platform activity, min 3 per active platform when possible, max 10 per
 * platform unless the org posted almost exclusively there.
 */
function allocatePeerQuota(counts: Map<Platform, number>): Map<Platform, number> {
  const active = [...counts.entries()].filter(([, n]) => n > 0);
  const total = active.reduce((sum, [, n]) => sum + n, 0);
  const alloc = new Map<Platform, number>();
  if (total === 0) return alloc;

  if (total <= SAMPLING.peerTargetMin) {
    for (const [p, n] of active) alloc.set(p, n);
    return alloc;
  }

  const target = Math.min(SAMPLING.peerTargetMax, total);
  const capFor = (p: Platform, n: number) =>
    n / total > SAMPLING.exclusivityShare ? n : Math.min(n, SAMPLING.maxPerPlatform);

  // Proportional start, respecting floors and caps.
  for (const [p, n] of active) {
    const proportional = Math.round((target * n) / total);
    const floor = Math.min(SAMPLING.minPerActivePlatform, n);
    alloc.set(p, Math.min(capFor(p, n), Math.max(floor, proportional)));
  }

  // Nudge the sum toward the target within floors/caps.
  const sum = () => [...alloc.values()].reduce((a, b) => a + b, 0);
  let guard = 50;
  while (sum() !== target && guard-- > 0) {
    const deficit = target - sum();
    const candidates = active
      .map(([p, n]) => ({ p, n, cur: alloc.get(p) ?? 0 }))
      .filter(({ p, n, cur }) =>
        deficit > 0
          ? cur < capFor(p, n)
          : cur > Math.min(SAMPLING.minPerActivePlatform, n),
      )
      .sort((a, b) => (deficit > 0 ? b.n - a.n : a.n - b.n));
    const pick = candidates[0];
    if (!pick) break;
    alloc.set(pick.p, pick.cur + (deficit > 0 ? 1 : -1));
  }
  return alloc;
}

function samplePeerOrg(orgRows: PostRow[]): PostRow[] {
  const juneRows = orgRows.filter((r) => isInJuneWindow(r.published_at) === true);
  const counts = new Map<Platform, number>();
  for (const r of juneRows) counts.set(r.platform, (counts.get(r.platform) ?? 0) + 1);

  const alloc = allocatePeerQuota(counts);
  const underQuota = juneRows.length < SAMPLING.peerTargetMin;

  const selected: PostRow[] = [];
  for (const [platform, k] of alloc) {
    const platformRows = newestFirst(juneRows.filter((r) => r.platform === platform));
    selected.push(...systematicPick(platformRows, k));
  }
  return selected.map((r) => ({ ...r, under_quota: underQuota, backfill_pre_june: false }));
}

/** ROLF June-first 30-post rule: June posts newest-first, then flagged pre-June backfill. */
function sampleRolf(orgRows: PostRow[]): PostRow[] {
  const june = newestFirst(orgRows.filter((r) => isInJuneWindow(r.published_at) === true));
  const preJune = newestFirst(
    orgRows.filter((r) => isInJuneWindow(r.published_at) === false),
  );

  const selected: PostRow[] = june
    .slice(0, SAMPLING.rolfSampleSize)
    .map((r) => ({ ...r, backfill_pre_june: false, under_quota: false }));
  for (const row of preJune) {
    if (selected.length >= SAMPLING.rolfSampleSize) break;
    selected.push({ ...row, backfill_pre_june: true, under_quota: false });
  }
  if (selected.length < SAMPLING.rolfSampleSize) {
    log.warn(
      `ROLF sample has only ${selected.length}/${SAMPLING.rolfSampleSize} posts even after backfill`,
    );
  }
  return selected;
}

function main(): void {
  const { rows } = dedupePostRows(loadPostRows());
  if (rows.length === 0) {
    log.warn('No post rows available — run collection (or fill manual_posts.csv) first.');
    return;
  }

  const byOrg = new Map<string, PostRow[]>();
  for (const row of rows) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  const sheet: PostRow[] = [];
  for (const [orgId, orgRows] of [...byOrg.entries()].sort()) {
    const sampled = orgId === FOCAL_ORG_ID ? sampleRolf(orgRows) : samplePeerOrg(orgRows);
    const undated = orgRows.filter((r) => isInJuneWindow(r.published_at) === null).length;
    log.info(
      `${orgId}: ${orgRows.length} collected → ${sampled.length} sampled` +
        (undated > 0 ? ` (${undated} rows with unknown dates excluded — verify manually)` : ''),
    );
    sheet.push(...sampled);
  }

  exportPostsCsv(sheet, CODING_SHEET_CSV);
  log.info(`Coding sheet with ${sheet.length} rows → ${CODING_SHEET_CSV}`);
  log.info(
    'Manual coding fields (ica_primary, format_coded, cta_present, cta_type, human_presence, caption_style, impact_packaging, coder_initials) are blank by design.',
  );
  log.info('Reminder: run the 15-post calibration set before full coding; freeze definitions first.');
}

main();
