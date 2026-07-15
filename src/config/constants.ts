import path from 'node:path';

// Load .env (ROLF_AUDIT_ROOT, ROLF_ACCEPT_LINKEDIN_RISK) if present.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine
}

export const PLATFORMS = ['instagram', 'facebook', 'linkedin'] as const;
export type PlatformName = (typeof PLATFORMS)[number];

export const PLATFORM_PREFIX: Record<PlatformName, string> = {
  instagram: 'ig',
  facebook: 'fb',
  linkedin: 'li',
};

// Primary content window: June 1–30, 2026 (Pacific).
export const JUNE_WINDOW_START_MS = Date.parse('2026-06-01T00:00:00-07:00');
export const JUNE_WINDOW_END_MS = Date.parse('2026-07-01T00:00:00-07:00');

export const ROOT_DIR = process.env.ROLF_AUDIT_ROOT ?? process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const SEEDS_DIR = path.join(DATA_DIR, 'seeds');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const NORMALIZED_DIR = path.join(DATA_DIR, 'normalized');
export const EVIDENCE_DIR = path.join(ROOT_DIR, 'evidence');
export const PROFILES_DIR = path.join(ROOT_DIR, '.profiles');

export const ORGANIZATIONS_CSV = path.join(SEEDS_DIR, 'organizations.csv');
export const ACCOUNT_SNAPSHOTS_CSV = path.join(NORMALIZED_DIR, 'account_snapshots.csv');
export const POSTS_JSON = path.join(NORMALIZED_DIR, 'posts_public_metrics.json');
export const POSTS_CSV = path.join(NORMALIZED_DIR, 'posts_public_metrics.csv');
export const MANUAL_POSTS_CSV = path.join(NORMALIZED_DIR, 'manual_posts.csv');
export const VALIDATION_REPORT_JSON = path.join(NORMALIZED_DIR, 'validation_report.json');
export const VALIDATION_FLAGS_CSV = path.join(NORMALIZED_DIR, 'validation_flags.csv');
export const AUDIT_SAMPLE_CSV = path.join(NORMALIZED_DIR, 'audit_sample.csv');
export const CODING_SHEET_CSV = path.join(NORMALIZED_DIR, 'coding_sheet.csv');

export function profileDir(platform: PlatformName): string {
  return path.join(PROFILES_DIR, platform);
}

// Conservative operational controls (research plan: "Rate limits, pacing, and
// safety defaults"). workers=1 and one page at a time are structural — every
// script runs a single sequential loop.
export const PACING = {
  navDelayMs: [2_000, 5_000] as const, // between page-level navigations
  accountDelayMs: [8_000, 15_000] as const, // between account-level transitions
  pauseEveryNPosts: 30, // long pause after every 25–40 post pages
  longPauseMs: [60_000, 120_000] as const,
  settleAfterNavMs: 2_500, // let dynamic UIs render before reading text
} as const;

export const SAMPLING = {
  peerTargetMin: 15,
  peerTargetMax: 20,
  minPerActivePlatform: 3,
  maxPerPlatform: 10,
  // A platform may exceed maxPerPlatform when the org posted almost exclusively there.
  exclusivityShare: 0.85,
  rolfSampleSize: 30,
  defaultMaxUrlsPerOrg: 60,
  defaultMaxPostsPerOrg: 20,
} as const;

export const LOGIN_URLS: Record<PlatformName, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  facebook: 'https://www.facebook.com/login/',
  linkedin: 'https://www.linkedin.com/login',
};

// Hard-stop triggers. Any match in visible body text stops the entire run
// (research plan: "stop if challenged" — never retry through a challenge).
export const CHALLENGE_PATTERNS: RegExp[] = [
  /suspicious activity/i,
  /unusual activity/i,
  /confirm your identity/i,
  /verify your identity/i,
  /verify your account/i,
  /security check/i,
  /\bcaptcha\b/i,
  /we limit how often/i,
  /temporarily blocked/i,
  /try again later/i,
  /couldn'?t verify/i,
  /help us confirm/i,
];

// URL fragments that indicate a challenge/checkpoint interstitial.
export const CHALLENGE_URL_PATTERN = /(checkpoint|challenge|authwall|\/consent)/i;
// URL fragments that indicate a forced-logout / auth failure.
export const LOGIN_URL_PATTERN = /(\/accounts\/login|\/login(\.php)?([/?]|$)|\/uas\/login)/i;
