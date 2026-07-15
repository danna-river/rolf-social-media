import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, SAMPLING, profileDir } from '../src/config/constants';
import type { PostLinkFile, PostRow } from '../src/config/schema';
import { launchAuditContext } from '../src/auth/context';
import { PostPacer, paceBetweenAccounts, withRetries } from '../src/common/backoff';
import { assertNoChallenge } from '../src/common/challenge';
import { enforceLinkedInPolicy, parseCliArgs, requirePlatform } from '../src/common/cli';
import { makeRunId } from '../src/common/dates';
import { isRunStopper } from '../src/common/errors';
import { log } from '../src/common/logger';
import { selectSeeds } from '../src/common/seeds';
import {
  loadPostRows,
  loadSnapshots,
  mergeAndSavePostRows,
  postKey,
  readJsonFile,
  snapshotFor,
} from '../src/common/store';
import { postExtractors } from '../src/collectors/index';
import { buildPostRow, evidenceTag, gotoAndSettle } from '../src/collectors/shared';

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const platform = requirePlatform(opts);
  enforceLinkedInPolicy(opts);

  const maxPosts = opts.maxPosts ?? SAMPLING.defaultMaxPostsPerOrg;
  const seeds = selectSeeds(platform, { limit: opts.limit, org: opts.org });
  if (seeds.length === 0) {
    log.warn(`No active ${platform} seeds found in data/seeds/organizations.csv`);
    return;
  }

  const snapshots = loadSnapshots();
  const runId = makeRunId(platform);
  log.info(
    `Run ${runId}: post metrics (max ${maxPosts}/org) for ${seeds.length} ${platform} account(s)`,
  );

  const context = await launchAuditContext(profileDir(platform));
  const page = context.pages()[0] ?? (await context.newPage());
  const extract = postExtractors[platform];
  const pacer = new PostPacer();
  const rows: PostRow[] = [];
  const existingKeys = opts.skipExisting
    ? new Set(loadPostRows().filter((r) => r.platform === platform).map(postKey))
    : new Set<string>();
  let challenged = false;

  try {
    orgLoop: for (const org of seeds) {
      const linksPath = path.join(RAW_DIR, platform, 'links', `${org.organization_id}.json`);
      if (!fs.existsSync(linksPath)) {
        log.warn(
          `${org.organization_id}: no links file (${linksPath}) — run run-post-enumeration first`,
        );
        continue;
      }
      const linkFile = readJsonFile<PostLinkFile | null>(linksPath, null);
      const candidateUrls = (linkFile?.links ?? []).slice(0, maxPosts).map((l) => l.url);
      const urls = opts.skipExisting
        ? candidateUrls.filter((url) => !existingKeys.has(`${platform}::${url}`))
        : candidateUrls;
      const snapshot = snapshotFor(snapshots, platform, org.organization_id);
      if (!snapshot) {
        log.warn(
          `${org.organization_id}: no account snapshot found — engagement rates will be null (run run-account-snapshots first)`,
        );
      }

      log.info(
        `${org.organization_id}: extracting ${urls.length} post page(s)` +
          (opts.skipExisting ? ` (${candidateUrls.length - urls.length} already in normalized output)` : ''),
      );
      for (const url of urls) {
        try {
          const row = await withRetries(
            async () => {
              await gotoAndSettle(page, url);
              await assertNoChallenge(
                page,
                platform,
                evidenceTag(platform, org.organization_id, 'metrics_nav'),
              );
              const extracted = await extract(page);
              return buildPostRow({ page, org, snapshot, runId, rawUrl: url, extracted });
            },
            { label: `${platform}/${org.organization_id} post` },
          );
          rows.push(row);
          log.info(
            `  ${row.post_id ?? row.post_url}: likes=${row.visible_like_count ?? 'n/a'} comments=${row.visible_comment_count ?? 'n/a'} status=${row.extraction_status}`,
          );
        } catch (err) {
          if (isRunStopper(err)) {
            log.error(`${err}`);
            log.error('Stopping the entire run per stop-if-challenged policy.');
            challenged = true;
            break orgLoop;
          }
          log.error(`  ${url}: extraction failed — ${String(err)}`);
          rows.push(
            await buildPostRow({
              page,
              org,
              snapshot,
              runId,
              rawUrl: url,
              extracted: null,
              extractionError: String(err),
            }),
          );
        }
        await pacer.tick();
      }
      await paceBetweenAccounts();
    }
  } finally {
    await context.close().catch(() => {});
  }

  if (rows.length > 0) {
    const rawOut = path.join(RAW_DIR, platform, 'posts', `${runId}.json`);
    fs.mkdirSync(path.dirname(rawOut), { recursive: true });
    fs.writeFileSync(rawOut, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    mergeAndSavePostRows(rows);
  }
  if (challenged) process.exitCode = 3;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
