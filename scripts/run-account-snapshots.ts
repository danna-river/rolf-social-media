import path from 'node:path';
import { profileDir, RAW_DIR } from '../src/config/constants';
import type { AccountSnapshot } from '../src/config/schema';
import { launchAuditContext } from '../src/auth/context';
import { paceBetweenAccounts, withRetries } from '../src/common/backoff';
import { enforceLinkedInPolicy, parseCliArgs, requirePlatform } from '../src/common/cli';
import { makeRunId, nowIso, nowPtDisplay } from '../src/common/dates';
import { isRunStopper } from '../src/common/errors';
import { log } from '../src/common/logger';
import { selectSeeds } from '../src/common/seeds';
import { mergeAndSaveSnapshots, writeJsonFile } from '../src/common/store';
import { accountCollectors } from '../src/collectors/index';
import { failedSnapshot } from '../src/collectors/shared';

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const platform = requirePlatform(opts);
  enforceLinkedInPolicy(opts);

  const seeds = selectSeeds(platform, { limit: opts.limit, org: opts.org });
  if (seeds.length === 0) {
    log.warn(`No active ${platform} seeds found in data/seeds/organizations.csv`);
    return;
  }

  const runId = makeRunId(platform);
  log.info(`Run ${runId}: account snapshots for ${seeds.length} ${platform} account(s)`);

  const context = await launchAuditContext(profileDir(platform));
  const page = context.pages()[0] ?? (await context.newPage());
  const collector = accountCollectors[platform];
  const snapshots: AccountSnapshot[] = [];
  let challenged = false;

  try {
    for (const org of seeds) {
      try {
        const snap = await withRetries(() => collector(page, org, runId), {
          label: `${platform}/${org.organization_id} snapshot`,
        });
        snapshots.push(snap);
        log.info(
          `${org.organization_id}: followers=${snap.follower_count_snapshot ?? 'n/a'} status=${snap.extraction_status}`,
        );
      } catch (err) {
        if (isRunStopper(err)) {
          log.error(`${err}`);
          log.error('Stopping the entire run per stop-if-challenged policy.');
          challenged = true;
          break;
        }
        log.error(`${org.organization_id}: snapshot failed — ${String(err)}`);
        snapshots.push(
          failedSnapshot(org, runId, String(err), { iso: nowIso(), pt: nowPtDisplay() }),
        );
      }
      await paceBetweenAccounts();
    }
  } finally {
    await context.close().catch(() => {});
  }

  if (snapshots.length > 0) {
    writeJsonFile(path.join(RAW_DIR, platform, 'accounts', `${runId}.json`), snapshots);
    mergeAndSaveSnapshots(snapshots);
  }
  if (challenged) {
    log.warn(
      'Run ended early on a platform challenge. Wait before any new session; switch remaining rows to manual collection if it recurs.',
    );
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
