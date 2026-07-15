import { ORGANIZATIONS_CSV, type PlatformName } from '../config/constants';
import type { OrgSeed, Platform } from '../config/schema';
import { readCsv } from './csv';

function parseBool(v: string | undefined): boolean {
  return /^(true|1|yes|y)$/i.test((v ?? '').trim());
}

export function loadSeeds(): OrgSeed[] {
  const records = readCsv(ORGANIZATIONS_CSV);
  return records.map((r) => ({
    organization_id: (r.organization_id ?? '').trim(),
    organization_name: (r.organization_name ?? '').trim(),
    tier: (r.tier ?? '').trim(),
    platform: (r.platform ?? '').trim() as Platform,
    account_handle: (r.account_handle ?? '').trim(),
    account_url: (r.account_url ?? '').trim(),
    active: parseBool(r.active),
    notes: (r.notes ?? '').trim() || null,
  }));
}

export function selectSeeds(
  platform: PlatformName,
  opts: { limit?: number | null; org?: string | null } = {},
): OrgSeed[] {
  let seeds = loadSeeds().filter(
    (s) => s.platform === platform && s.active && s.account_url.length > 0,
  );
  if (opts.org) seeds = seeds.filter((s) => s.organization_id === opts.org);
  if (opts.limit && opts.limit > 0) seeds = seeds.slice(0, opts.limit);
  return seeds;
}
