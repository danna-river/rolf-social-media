import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { EVIDENCE_DIR, ROOT_DIR } from '../config/constants';

function safeName(tag: string): string {
  return tag.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 140);
}

/**
 * Capture screenshot + HTML + body text for the current page. Returns the
 * screenshot path relative to the repo root (for the evidence_screenshot column).
 * Never throws — evidence capture must not turn a partial row into a failure.
 */
export async function captureEvidence(page: Page, tag: string): Promise<string | null> {
  const name = safeName(tag);
  const screenshotAbs = path.join(EVIDENCE_DIR, 'screenshots', `${name}.png`);
  const htmlAbs = path.join(EVIDENCE_DIR, 'html', `${name}.html`);
  const bodyAbs = path.join(EVIDENCE_DIR, 'bodytext', `${name}.txt`);
  for (const p of [screenshotAbs, htmlAbs, bodyAbs]) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }

  let screenshotOk = false;
  try {
    await page.screenshot({ path: screenshotAbs, fullPage: false });
    screenshotOk = true;
  } catch {
    // ignore
  }
  try {
    fs.writeFileSync(htmlAbs, await page.content(), 'utf8');
  } catch {
    // ignore
  }
  try {
    const body = await page.locator('body').innerText();
    fs.writeFileSync(bodyAbs, body, 'utf8');
  } catch {
    // ignore
  }

  return screenshotOk ? path.relative(ROOT_DIR, screenshotAbs) : null;
}
