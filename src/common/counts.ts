/**
 * One parser everywhere so numbers like `1.2K`, `3,456`, or `2M` normalize
 * consistently across platforms.
 */
export function parseCompactCount(input: string | null | undefined): number | null {
  if (!input) return null;
  const text = input.replace(/\s+/g, ' ').trim().replace(/,/g, '').toUpperCase();

  const m = text.match(/(-?\d+(?:\.\d+)?)\s*([KMB])?/);
  if (!m) return null;

  const base = Number(m[1]);
  if (Number.isNaN(base)) return null;

  const mult =
    m[2] === 'K' ? 1_000 :
    m[2] === 'M' ? 1_000_000 :
    m[2] === 'B' ? 1_000_000_000 :
    1;

  return Math.round(base * mult);
}

export function countHashtags(text: string | null | undefined): number | null {
  if (text == null) return null;
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function countMentions(text: string | null | undefined): number | null {
  if (text == null) return null;
  return (text.match(/@[A-Za-z0-9._]+/g) ?? []).length;
}
