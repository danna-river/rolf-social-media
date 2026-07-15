import { PLATFORMS, type PlatformName } from '../config/constants';

export interface CliOptions {
  platform: PlatformName | null;
  limit: number | null;
  maxUrls: number | null;
  maxPosts: number | null;
  org: string | null;
  acceptLinkedInRisk: boolean;
  skipExisting: boolean;
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const opts: CliOptions = {
    platform: null,
    limit: null,
    maxUrls: null,
    maxPosts: null,
    org: null,
    acceptLinkedInRisk: Boolean(process.env.ROLF_ACCEPT_LINKEDIN_RISK),
    skipExisting: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? null;
    switch (arg) {
      case '--platform': {
        const value = next();
        if (!value || !(PLATFORMS as readonly string[]).includes(value)) {
          throw new Error(`--platform must be one of: ${PLATFORMS.join(', ')}`);
        }
        opts.platform = value as PlatformName;
        break;
      }
      case '--limit':
        opts.limit = Number(next());
        break;
      case '--max-urls':
        opts.maxUrls = Number(next());
        break;
      case '--max-posts':
        opts.maxPosts = Number(next());
        break;
      case '--org':
        opts.org = next();
        break;
      case '--accept-linkedin-risk':
        opts.acceptLinkedInRisk = true;
        break;
      case '--skip-existing':
        opts.skipExisting = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

export function requirePlatform(opts: CliOptions): PlatformName {
  if (!opts.platform) {
    throw new Error('Missing required --platform <instagram|facebook|linkedin>');
  }
  return opts.platform;
}

/**
 * LinkedIn is manual-first per the research plan: automation runs only when the
 * operator explicitly accepts the policy risk.
 */
export function enforceLinkedInPolicy(opts: CliOptions): void {
  if (opts.platform === 'linkedin' && !opts.acceptLinkedInRisk) {
    console.error(
      [
        '',
        'LinkedIn is configured manual-first: LinkedIn help pages state that scraping,',
        'bots, and other unauthorized automated access violate the User Agreement.',
        '',
        'Preferred paths:',
        '  - Peer pages: collect manually and enter rows into data/normalized/manual_posts.csv',
        '    (template: data/templates/manual_post_entry.csv)',
        '  - ROLF-owned page: use official admin analytics exports.',
        '',
        'To run browser automation anyway (you accept the residual policy/account risk),',
        're-run with --accept-linkedin-risk or set ROLF_ACCEPT_LINKEDIN_RISK=1.',
        '',
      ].join('\n'),
    );
    process.exit(2);
  }
}
