/**
 * Instagram post pages stopped rendering "N likes" as visible body text
 * (observed 2026-07-14 during the pilot). The reliable public sources on the
 * permalink page are:
 *   1. <meta property="og:description"> — "6 likes, 1 comments - handle on June 26, 2026: "caption…""
 *   2. embedded JSON — "caption":{"…","text":"full caption"}
 * These helpers are shared by the live extractor and the evidence-repair script.
 */

export interface IgMetaDescription {
  likesRaw: string | null;
  commentsRaw: string | null;
  dateRaw: string | null;
  captionStart: string | null;
}

export function parseInstagramMetaDescription(
  content: string | null | undefined,
): IgMetaDescription {
  if (!content) {
    return { likesRaw: null, commentsRaw: null, dateRaw: null, captionStart: null };
  }
  const counts = content.match(
    /([\d.,]+\s*[KMB]?)\s+likes?,\s*([\d.,]+\s*[KMB]?)\s+comments?\s*-\s*\S+\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
  );
  const caption = content.match(/:\s*[“"]([\s\S]*)$/);
  let captionStart = caption?.[1] ?? null;
  if (captionStart) captionStart = captionStart.replace(/["”]\s*$/, '').trim();
  return {
    likesRaw: counts?.[1] ?? null,
    commentsRaw: counts?.[2] ?? null,
    dateRaw: counts?.[3] ?? null,
    captionStart,
  };
}

/** Pull the full post caption out of the page's embedded JSON, if present. */
export function extractInstagramEmbeddedCaption(html: string): string | null {
  const capIdx = html.indexOf('"caption":{');
  if (capIdx < 0) return null;
  const textKey = '"text":"';
  const tIdx = html.indexOf(textKey, capIdx);
  if (tIdx < 0 || tIdx > capIdx + 2000) return null;

  let i = tIdx + textKey.length;
  let raw = '';
  while (i < html.length) {
    const ch = html[i]!;
    if (ch === '\\') {
      raw += ch + (html[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === '"') break;
    raw += ch;
    i++;
  }
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Read the og/meta description straight out of saved HTML (evidence repair path). */
export function extractMetaDescriptionFromHtml(html: string): string | null {
  const m =
    html.match(
      /<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"/,
    ) ??
    html.match(
      /<meta[^>]+content="([^"]*)"[^>]+(?:property="og:description"|name="description")/,
    );
  return m ? decodeHtmlEntities(m[1]!) : null;
}
