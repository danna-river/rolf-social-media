import {
  AUDIT_WINDOW_END_MS,
  AUDIT_WINDOW_LABEL,
  AUDIT_WINDOW_START_MS,
} from '../config/constants';

const PT_TZ = 'America/Los_Angeles';

/** ISO 8601 with the machine's local timezone offset (never bare UTC-less strings). */
export function toIsoWithOffset(d: Date): string {
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${pad(Math.trunc(Math.abs(offMin) / 60))}:${pad(Math.abs(offMin) % 60)}`;
}

export function nowIso(): string {
  return toIsoWithOffset(new Date());
}

/** Separate local-display timestamp in America/Los_Angeles. */
export function nowPtDisplay(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PT_TZ,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());
}

/**
 * true/false when the timestamp parses; null when it is missing or unparseable
 * (never guess — the raw string is preserved elsewhere).
 */
export function isInAuditWindow(publishedAt: string | null | undefined): boolean | null {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  return t >= AUDIT_WINDOW_START_MS && t < AUDIT_WINDOW_END_MS;
}

export const auditWindowLabel = AUDIT_WINDOW_LABEL;

export function isInJuneWindow(publishedAt: string | null | undefined): boolean | null {
  return isInAuditWindow(publishedAt);
}

/** e.g. 2026-07-15T14-00-00_PT_instagram */
export function makeRunId(platform: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}-${get('minute')}-${get('second')}_PT_${platform}`;
}
