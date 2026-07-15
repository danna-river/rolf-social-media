import path from 'node:path';
import { RAW_DIR, SAMPLING, profileDir } from '../src/config/constants';
import type { PostLinkFile } from '../src/config/schema';
import { launchAuditContext } from '../src/auth/context';
import { paceBetweenAccounts, withRetries } from '../src/common/backoff';
import { enforceLinkedInPolicy, parseCliArgs, requirePlatform } from '../src/common/cli';
import { makeRunId, nowIso } from '../src/common/dates';
import { isRunStopper } from '../src/common/errors';
import { log } from '../src/common/logger';
import { selectSeeds } from '../src/common/seeds';
import { writeJsonFile } from '../src/common/store';
import { postsListingUrl } from '../src/common/urls';
import { postEnumerators } from '../src/collectors/index';

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const platform = requirePlatform(opts);
  enforceLinkedInPolicy(opts);

  const maxUrls = opts.maxUrls ?? SAMPLING.defaultMaxUrlsPerOrg;
  const seeds = selectSeeds(platform, { limit: opts.limit, org: opts.org });
  if (seeds.length === 0) {
    log.warn(`No active ${platform} seeds found in data/seeds/organizations.csv`);
    return;
  }

  const runId = makeRunId(platform);
  log.info(
    `Run ${runId}: enumerating up to ${maxUrls} post URLs for ${seeds.length} ${platform} account(s)`,
  );

  const context = await launchAuditContext(profileDir(platform));
  const page = context.pages()[0] ?? (await context.newPage());
  const enumerate = postEnumerators[platform];
  let challenged = false;

  try {
    for (const org of seeds) {
      try {
        const links = await withRetries(() => enumerate(page, org, maxUrls), {
          label: `${platform}/${org.organization_id} enumeration`,
        });
        const file: PostLinkFile = {
          run_id: runId,
          organization_id: org.organization_id,
          platform: org.platform,
          source_url: postsListingUrl(org.account_url, org.platform),
          collected_at: nowIso(),
          links,
        };
        const out = path.join(RAW_DIR, platform, 'links', `${org.organization_id}.json`);
        writeJsonFile(out, file);
        log.info(`${org.organization_id}: ${links.length} post URLs → ${out}`);
      } catch (err) {
        if (isRunStopper(err)) {
          log.error(`${err}`);
          log.error('Stopping the entire run per stop-if-challenged policy.');
          challenged = true;
          break;
        }
        log.error(`${org.organization_id}: enumeration failed — ${String(err)}`);
      }
      await paceBetweenAccounts();
    }
  } finally {
    await context.close().catch(() => {});
  }

  if (challenged) process.exitCode = 3;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
