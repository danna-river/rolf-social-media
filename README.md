# rolf-social-audit

Low-volume, auditable collection pipeline for the River of Life Foundation (ROLF)
social media growth audit: ROLF + 20 peer nonprofits across Instagram, Facebook,
and LinkedIn, June 1–30, 2026 posting window, public metrics only for peers.

Implements the "Machine-Executable Research Plan for the River of Life Foundation
Social Media Growth Audit."

## Non-negotiable constraints (stop if challenged)

- **Public data only.** Peers: public UI metrics only. ROLF-owned accounts: prefer
  first-party analytics (Meta Business Suite / Instagram Insights, LinkedIn admin
  analytics) and keep those numbers separate from peer comparisons.
- **LinkedIn is collected manually (operator decision 2026-07-14).** LinkedIn
  prohibits scraping/automated access, so its collectors stay gated
  (`--accept-linkedin-risk` / `ROLF_ACCEPT_LINKEDIN_RISK=1` would be required)
  and the LinkedIn seed rows are inactive. Hand-collect instead — see
  "Manual LinkedIn collection" below.
- **Hard stop on any challenge.** Every navigation is checked for checkpoint /
  suspicious-activity / CAPTCHA signals. On a match the whole run stops (exit
  code 3), evidence is saved, and nothing retries. Wait, then continue manually.
- Never: proxies, CAPTCHA solving, fingerprint spoofing, fake accounts,
  parallel sessions, private data, or continuing after a warning.
- Pacing defaults: 1 worker, 1 page, 2–5 s between pages, 8–15 s between
  accounts, long pause every ~30 post pages, max one low-volume session per
  platform per day.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # optional
```

Fill in `data/seeds/organizations.csv` — one row per organization-platform with
verified handle + URL, `active=true` to include it in runs. ROLF is
`organization_id=rolf` (the June-first 30-post rule keys off this id).

## Login (manual, one profile per platform)

```bash
npx tsx src/auth/login.instagram.ts
npx tsx src/auth/login.facebook.ts
npx tsx src/auth/login.linkedin.ts
```

Log in by hand (including 2FA) in the opened browser, then close the window.
Sessions persist in `.profiles/<platform>/` (git-ignored). Never use your
default Chrome profile.

## Dry run (3-org pilot)

```bash
npx tsx scripts/run-account-snapshots.ts --platform instagram --limit 3
npx tsx scripts/run-post-enumeration.ts  --platform instagram --limit 3
npx tsx scripts/run-post-metrics.ts      --platform instagram --limit 3 --max-posts 15
```

Check `data/raw/`, `data/normalized/`, and `evidence/screenshots/` before scaling.

## Full run (sequential, one platform per session)

```bash
npx tsx scripts/run-account-snapshots.ts --platform instagram
npx tsx scripts/run-post-enumeration.ts  --platform instagram
npx tsx scripts/run-post-metrics.ts      --platform instagram
# … same for facebook; linkedin only with --accept-linkedin-risk, else manual entry
```

Useful flags: `--limit N` (first N orgs), `--org <organization_id>`,
`--max-urls N` (enumeration cap, default 60), `--max-posts N` (extraction cap
per org, default 20).

## Manual LinkedIn collection

Company-page URLs for all 9 orgs are in `data/seeds/organizations.csv`
(linkedin rows). For each org, in a normal logged-in browser session:

1. Open `<company-url>/posts/?feedView=all` and scroll to cover June 1–30, 2026.
2. For each June post, add one row to `data/normalized/manual_posts.csv`
   (start the file by copying `data/templates/manual_post_entry.csv`). Fill at
   minimum: `organization_id` (must match the seed file), `organization_name`,
   `tier`, `platform=linkedin`, `post_url`, `published_at` (ISO date),
   `caption_text`, `visible_like_count` (reactions), `visible_comment_count`,
   `visible_share_count` (reposts), `visible_view_count` (video only),
   `follower_count_snapshot` (from the page header, same day for all orgs),
   `extraction_status=complete`, `qa_status=unchecked`.
3. If a count isn't shown, leave the cell empty (never 0) and note why in `notes`.
4. Screenshots into `evidence/screenshots/` with the path in `evidence_screenshot`
   make QA much easier for ambiguous rows.

Derived fields (`public_interactions_count`, `engagement_rate_public_pct`,
`view_interaction_rate_per_1000`, `in_june_window`, caption length/hashtag/mention
counts) are computed automatically for manual rows during validation and coding-sheet
prep — leave them blank. Manual rows flow through `run-validation` and
`prepare-coding-sheet` identically to automated rows.

## Validation and coding prep

```bash
npx tsx scripts/run-validation.ts
npx tsx scripts/prepare-coding-sheet.ts
```

- `run-validation` → `data/normalized/validation_report.json`,
  `validation_flags.csv`, and a deterministic 10% `audit_sample.csv` to check
  against live pages/screenshots.
- `prepare-coding-sheet` → `data/normalized/coding_sheet.csv` with sampling
  applied: peers get 15–20 June posts allocated proportionally by platform
  (min 3 per active platform, max 10 per platform unless >85% of activity is
  there; `under_quota=true` when June total < 15). ROLF gets the June-first
  30-post rule with `backfill_pre_june=true` flags.

Manual coding fields (`ica_primary`, `format_coded`, `cta_present`, `cta_type`,
`human_presence`, `caption_style`, `impact_packaging`, `coder_initials`) are
exported blank; the allowed labels live in `src/export/workbook-map.ts` and must
exactly match the workbook dropdowns. Run the 15-post calibration set and freeze
definitions before full coding; double-code 10% if time allows.

## Formulas (public peer benchmark)

- `public_interactions_count` — IG: likes + comments; FB: reactions + comments +
  visible shares; LI: reactions + comments + visible reposts. Null (excluded from
  rates) when the like/reaction count is hidden — never guessed.
- `engagement_rate_public_pct = interactions / follower_count_snapshot × 100`
- `view_interaction_rate_per_1000 = interactions / visible_view_count × 1000`

ROLF internal metrics (reach, impressions, saves, profile visits, follows, link
taps) come from first-party exports and stay out of the peer benchmark.

## Layout

```
data/seeds/         organizations.csv (+ json mirror) — the verified org universe
data/raw/           per-run captures: accounts/, links/, posts/ per platform
data/normalized/    account_snapshots.csv, posts_public_metrics.{csv,json},
                    validation_report.json, coding_sheet.csv, manual_posts.csv
data/templates/     manual_post_entry.csv header for hand-collected rows
evidence/           screenshots / html / bodytext for partial, failed, or challenged pages
src/                config, common utilities, auth, collectors, qa, export
scripts/            the five runbook entry points
.profiles/          persistent logged-in Chromium profiles (git-ignored)
```

Selectors in `src/collectors/` are **starting hypotheses, not contracts** —
validate them on collection day with `npx playwright codegen <url>` and adjust;
every extractor falls back to body-text regex parsing and records
`extraction_status=partial` with evidence rather than dropping rows.
