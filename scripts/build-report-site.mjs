import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POSTS_PATH = path.join(ROOT, 'data', 'normalized', 'posts_public_metrics.json');
const SNAPSHOTS_PATH = path.join(ROOT, 'data', 'normalized', 'account_snapshots.csv');
const OUT_PATH = path.join(ROOT, 'docs', 'index.html');

const ORG_LABELS = {
  rolf: 'River of Life',
  marthas_kitchen: "Martha's Kitchen",
  sunnyvale_cs: 'Sunnyvale CS',
  sacred_heart_cs: 'Sacred Heart',
  west_valley_cs: 'West Valley CS',
  loaves_fishes_sj: 'Loaves & Fishes',
  cityteam: 'CityTeam',
  sunday_friends: 'Sunday Friends',
};

const SHORT_LABELS = {
  rolf: 'ROLF',
  marthas_kitchen: "Martha's",
  sunnyvale_cs: 'Sunnyvale',
  sacred_heart_cs: 'Sacred Heart',
  west_valley_cs: 'West Valley',
  loaves_fishes_sj: 'Loaves',
  cityteam: 'CityTeam',
  sunday_friends: 'Sunday Friends',
};

const COLORS = {
  ink: '#202124',
  muted: '#68707a',
  rule: '#d9dee4',
  paper: '#f7f4ee',
  panel: '#ffffff',
  blue: '#0072B2',
  orange: '#D55E00',
  green: '#009E73',
  purple: '#CC79A7',
  gold: '#E69F00',
  grey: '#8a929c',
  lightBlue: '#D9ECF7',
  lightOrange: '#F6D9C9',
  lightGreen: '#D8EFE7',
};

function parseCsv(text) {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else {
      field += ch;
    }
  }
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((v) => v.trim()));
  const header = nonEmpty.shift() ?? [];
  return nonEmpty.map((row) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), row[i] ?? ''])),
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCaption(caption) {
  return String(caption ?? '').replace(/\s+/g, ' ').trim();
}

const POSITIVE_TONE_WORDS = [
  'thank', 'thanks', 'grateful', 'gratitude', 'thrilled', 'congratulations',
  'happy', 'support', 'hope', 'love', 'generous', 'celebrate', 'proud',
  'welcome', 'kindness', 'dignity', 'together', 'partner', 'community',
  'volunteer', 'fresh', 'safe', 'free', 'help', 'care',
];

const NEED_TONE_WORDS = [
  'need', 'needs', 'struggle', 'struggling', 'hunger', 'homelessness',
  'poverty', 'crisis', 'lack', 'hardship', 'challenge', 'challenges',
  'urgent', 'emergency', 'vulnerable', 'cost of living', 'food insecurity',
  'unsafe', 'support families', 'prevent homelessness',
];

function countMatches(text, words) {
  return words.reduce((sum, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = word.includes(' ')
      ? new RegExp(escaped, 'gi')
      : new RegExp(`\\b${escaped}\\b`, 'gi');
    return sum + (text.match(pattern) ?? []).length;
  }, 0);
}

function analyzeTone(caption) {
  const text = normalizeCaption(caption).toLowerCase();
  if (!text) return { label: 'No caption', score: 0, positive: 0, need: 0 };
  const positive = countMatches(text, POSITIVE_TONE_WORDS);
  const need = countMatches(text, NEED_TONE_WORDS);
  const score = positive - need;
  const label =
    need >= positive + 1 || need >= 2
      ? 'Need-focused'
      : positive >= need + 1 && positive > 0
        ? 'Uplifting'
        : 'Informational';
  return { label, score, positive, need };
}

function uniquePostKey(row) {
  if (row.platform !== 'facebook') return `${row.platform}|${row.post_url}`;
  const caption = normalizeCaption(row.caption_text).slice(0, 180);
  return [
    row.organization_id,
    row.platform,
    row.published_at ?? '',
    caption || row.post_id || row.post_url,
    row.visible_like_count ?? '',
    row.visible_comment_count ?? '',
    row.visible_share_count ?? '',
  ].join('|');
}

function median(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function mean(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return xs.length === 0 ? null : xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

function stddev(values) {
  const avg = mean(values);
  if (avg === null) return 1;
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const variance = xs.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(xs.length, 1);
  return Math.sqrt(variance) || 1;
}

function rank(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(0);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[sorted[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  if (mx === null || my === null) return null;
  const numerator = x.reduce((sum, value, i) => sum + (value - mx) * (y[i] - my), 0);
  const denomX = Math.sqrt(x.reduce((sum, value) => sum + (value - mx) ** 2, 0));
  const denomY = Math.sqrt(y.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return denomX === 0 || denomY === 0 ? null : numerator / (denomX * denomY);
}

function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(rank(x), rank(y));
}

function fmtPct(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(value >= 10 ? 0 : 2)}%`;
}

function fmtNum(value) {
  if (value === null || value === undefined) return 'n/a';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function niceDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function slug(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function chartFrame(title, deck, svg) {
  return `
    <figure class="chart-block" aria-labelledby="${slug(title)}-title">
      <figcaption>
        <h3 id="${slug(title)}-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(deck)}</p>
      </figcaption>
      ${svg}
    </figure>`;
}

function stackedVolumeChart(data) {
  const width = 920;
  const height = 500;
  const margin = { top: 44, right: 130, bottom: 46, left: 142 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxTotal = Math.max(...data.map((d) => d.ig + d.fb), 1);
  const rowH = plotH / data.length;
  const barH = Math.min(28, rowH * 0.54);
  const x = (v) => margin.left + (v / maxTotal) * plotW;
  const grid = [0, Math.ceil(maxTotal / 4), Math.ceil(maxTotal / 2), Math.ceil((maxTotal * 3) / 4), maxTotal];
  const bars = data
    .map((d, i) => {
      const y = margin.top + i * rowH + (rowH - barH) / 2;
      const igW = x(d.ig) - margin.left;
      const fbW = x(d.ig + d.fb) - x(d.ig);
      const total = d.ig + d.fb;
      return `
        <g>
          <text x="${margin.left - 12}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="end" class="${d.id === 'rolf' ? 'axis org-focus' : 'axis'}">${escapeHtml(d.short)}</text>
          <rect x="${margin.left}" y="${y.toFixed(1)}" width="${igW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${COLORS.blue}" rx="4"></rect>
          <rect x="${x(d.ig).toFixed(1)}" y="${y.toFixed(1)}" width="${fbW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${COLORS.orange}" rx="4"></rect>
          <text x="${(x(total) + 8).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" class="chart-value">${total || '0'}</text>
        </g>`;
    })
    .join('');
  const gridLines = grid
    .map((g) => {
      const gx = x(g);
      return `<g><line x1="${gx}" x2="${gx}" y1="${margin.top - 8}" y2="${height - margin.bottom + 6}" class="grid"></line><text x="${gx}" y="${height - 18}" text-anchor="middle" class="axis">${g}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="June post count by organization, split by Instagram and Facebook">
    ${gridLines}
    ${bars}
    <text x="${margin.left}" y="22" class="axis-title">June posts in analysis sample</text>
    <g transform="translate(${width - 118} 30)">
      <rect width="12" height="12" fill="${COLORS.blue}" rx="2"></rect><text x="18" y="11" class="legend">Instagram</text>
      <rect y="24" width="12" height="12" fill="${COLORS.orange}" rx="2"></rect><text x="18" y="35" class="legend">Facebook</text>
    </g>
  </svg>`;
}

function engagementChart(data) {
  const width = 920;
  const height = 500;
  const margin = { top: 30, right: 116, bottom: 54, left: 150 };
  const plotW = width - margin.left - margin.right;
  const rowH = (height - margin.top - margin.bottom) / data.length;
  const maxValue = Math.max(...data.flatMap((d) => [d.ig ?? 0, d.fb ?? 0]), 1);
  const x = (v) => margin.left + (v / maxValue) * plotW;
  const ticks = [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue];
  const rows = data
    .map((d, i) => {
      const cy = margin.top + i * rowH + rowH / 2;
      const igW = d.ig === null ? 0 : x(d.ig) - margin.left;
      const fbW = d.fb === null ? 0 : x(d.fb) - margin.left;
      const labelWeight = d.id === 'rolf' ? ' class="axis org-focus"' : ' class="axis"';
      return `<g>
        <text x="${margin.left - 12}" y="${cy + 4}" text-anchor="end"${labelWeight}>${escapeHtml(d.short)}</text>
        <rect x="${margin.left}" y="${cy - 13}" width="${Math.max(0, igW).toFixed(1)}" height="10" fill="${COLORS.blue}" rx="3"></rect>
        <rect x="${margin.left}" y="${cy + 3}" width="${Math.max(0, fbW).toFixed(1)}" height="10" fill="${COLORS.orange}" rx="3"></rect>
        <text x="${x(d.ig ?? 0) + 6}" y="${cy - 4}" class="chart-value">${d.ig === null ? 'n/a' : d.ig.toFixed(2)}</text>
        <text x="${x(d.fb ?? 0) + 6}" y="${cy + 12}" class="chart-value">${d.fb === null ? 'n/a' : d.fb.toFixed(2)}</text>
      </g>`;
    })
    .join('');
  const grid = ticks
    .map((t) => {
      const gx = x(t);
      return `<g><line x1="${gx}" x2="${gx}" y1="${margin.top - 8}" y2="${height - margin.bottom + 6}" class="grid"></line><text x="${gx}" y="${height - 24}" text-anchor="middle" class="axis">${t.toFixed(1)}%</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Median engagement rate by organization and platform">
    ${grid}
    ${rows}
    <text x="${margin.left}" y="22" class="axis-title">Median public engagement rate</text>
    <g transform="translate(${width - 104} 30)">
      <rect width="12" height="12" fill="${COLORS.blue}" rx="2"></rect><text x="18" y="11" class="legend">Instagram</text>
      <rect y="24" width="12" height="12" fill="${COLORS.orange}" rx="2"></rect><text x="18" y="35" class="legend">Facebook</text>
    </g>
  </svg>`;
}

function scatterChart(data) {
  const width = 920;
  const height = 460;
  const margin = { top: 42, right: 128, bottom: 46, left: 142 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const ranked = [...data]
    .map((d) => ({ ...d, efficiency: d.followers > 0 ? (d.interactions / d.followers) * 1000 : 0 }))
    .sort((a, b) => b.efficiency - a.efficiency);
  const rowH = plotH / ranked.length;
  const barH = Math.min(26, rowH * 0.52);
  const maxValue = Math.max(...ranked.map((d) => d.efficiency), 1);
  const x = (v) => margin.left + (v / maxValue) * plotW;
  const rows = ranked
    .map((d, i) => {
      const y = margin.top + i * rowH + (rowH - barH) / 2;
      const color = d.id === 'rolf' ? COLORS.orange : COLORS.green;
      return `<g>
        <text x="${margin.left - 12}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="end" class="${d.id === 'rolf' ? 'axis org-focus' : 'axis'}">${escapeHtml(d.short)}</text>
        <rect x="${margin.left}" y="${y.toFixed(1)}" width="${(x(d.efficiency) - margin.left).toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="4"></rect>
        <text x="${(x(d.efficiency) + 8).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" class="chart-value">${d.efficiency.toFixed(1)}</text>
      </g>`;
    })
    .join('');
  const ticks = [0, maxValue / 4, maxValue / 2, (maxValue * 3) / 4, maxValue]
    .map((t) => {
      const gx = x(t);
      return `<g><line x1="${gx}" x2="${gx}" y1="${margin.top - 8}" y2="${height - margin.bottom + 6}" class="grid"></line><text x="${gx}" y="${height - 18}" text-anchor="middle" class="axis">${t.toFixed(1)}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="June public interactions per one thousand followers">
    ${ticks}
    ${rows}
    <text x="${margin.left}" y="24" class="axis-title">June interactions per 1,000 followers</text>
  </svg>`;
}

function formatChart(data) {
  const width = 920;
  const height = 330;
  const margin = { top: 28, right: 96, bottom: 70, left: 130 };
  const plotW = width - margin.left - margin.right;
  const maxValue = Math.max(...data.flatMap((d) => [d.peerMedian ?? 0, d.rolfMedian ?? 0]), 1);
  const rowH = (height - margin.top - margin.bottom) / data.length;
  const x = (v) => margin.left + (v / maxValue) * plotW;
  const rows = data
    .map((d, i) => {
      const cy = margin.top + i * rowH + rowH / 2;
      const peerW = x(d.peerMedian ?? 0) - margin.left;
      const rolfW = x(d.rolfMedian ?? 0) - margin.left;
      return `<g>
        <text x="${margin.left - 12}" y="${cy + 4}" text-anchor="end" class="axis">${escapeHtml(d.label)}</text>
        <rect x="${margin.left}" y="${cy - 13}" width="${peerW.toFixed(1)}" height="10" fill="${COLORS.green}" rx="3"></rect>
        <rect x="${margin.left}" y="${cy + 3}" width="${Math.max(0, rolfW).toFixed(1)}" height="10" fill="${COLORS.orange}" rx="3"></rect>
        <text x="${x(d.peerMedian ?? 0) + 6}" y="${cy - 4}" class="chart-value">${d.peerMedian === null ? 'n/a' : d.peerMedian.toFixed(2)}</text>
        <text x="${x(d.rolfMedian ?? 0) + 6}" y="${cy + 12}" class="chart-value">${d.rolfMedian === null ? 'n/a' : d.rolfMedian.toFixed(2)}</text>
      </g>`;
    })
    .join('');
  const ticks = [0, maxValue / 4, maxValue / 2, (maxValue * 3) / 4, maxValue]
    .map((t) => {
      const gx = x(t);
      return `<g><line x1="${gx}" x2="${gx}" y1="${margin.top - 8}" y2="${height - margin.bottom + 6}" class="grid"></line><text x="${gx}" y="${height - 35}" text-anchor="middle" class="axis">${t.toFixed(1)}%</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Instagram format median engagement">
    ${ticks}
    ${rows}
    <text x="${margin.left}" y="22" class="axis-title">Instagram median engagement by format</text>
    <g transform="translate(${width - 112} 30)">
      <rect width="12" height="12" fill="${COLORS.green}" rx="2"></rect><text x="18" y="11" class="legend">Peers</text>
      <rect y="24" width="12" height="12" fill="${COLORS.orange}" rx="2"></rect><text x="18" y="35" class="legend">ROLF</text>
    </g>
  </svg>`;
}

function rosterCards(orgData) {
  return orgData
    .map((org) => `
      <article class="org-card">
        <h3>${escapeHtml(org.name)}</h3>
        <dl>
          <dt>June posts analyzed</dt><dd>${fmtNum(org.totalCount)}</dd>
          <dt>Instagram</dt><dd>${fmtNum(org.igCount)}</dd>
          <dt>Facebook</dt><dd>${fmtNum(org.fbCount)}</dd>
        </dl>
      </article>`)
    .join('');
}

function toneChart(data) {
  const width = 920;
  const height = 520;
  const margin = { top: 48, right: 142, bottom: 48, left: 146 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const rowH = plotH / data.length;
  const barH = Math.min(28, rowH * 0.54);
  const colors = {
    Uplifting: COLORS.green,
    Informational: COLORS.blue,
    'Need-focused': COLORS.gold,
  };
  const labels = ['Uplifting', 'Informational', 'Need-focused'];
  const rows = data
    .map((org, index) => {
      const y = margin.top + index * rowH + (rowH - barH) / 2;
      let cursor = margin.left;
      const segments = labels
        .map((label) => {
          const pct = org.total > 0 ? org.counts[label] / org.total : 0;
          const w = pct * plotW;
          const segment = `<rect x="${cursor.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="${colors[label]}" rx="4"></rect>`;
          cursor += w;
          return segment;
        })
        .join('');
      const dominant = labels.reduce((best, label) => (org.counts[label] > org.counts[best] ? label : best), labels[0]);
      return `<g>
        <text x="${margin.left - 12}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="end" class="${org.id === 'rolf' ? 'axis org-focus' : 'axis'}">${escapeHtml(org.short)}</text>
        ${segments}
        <text x="${width - margin.right + 10}" y="${(y + barH / 2 + 4).toFixed(1)}" class="chart-value">${escapeHtml(dominant)}</text>
      </g>`;
    })
    .join('');
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((tick) => {
      const x = margin.left + tick * plotW;
      return `<g><line x1="${x}" x2="${x}" y1="${margin.top - 8}" y2="${height - margin.bottom + 6}" class="grid"></line><text x="${x}" y="${height - 18}" text-anchor="middle" class="axis">${Math.round(tick * 100)}%</text></g>`;
    })
    .join('');
  const legend = labels
    .map((label, i) => `<rect x="${width - 132}" y="${28 + i * 22}" width="12" height="12" fill="${colors[label]}" rx="2"></rect><text x="${width - 114}" y="${39 + i * 22}" class="legend">${label}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Caption tone mix by organization">
    ${grid}
    ${rows}
    ${legend}
    <text x="${margin.left}" y="26" class="axis-title">Caption tone mix</text>
  </svg>`;
}

function euclidean(a, b) {
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
}

function standardizeRows(rows, keys) {
  const centers = Object.fromEntries(keys.map((key) => [key, mean(rows.map((row) => row[key])) ?? 0]));
  const spreads = Object.fromEntries(keys.map((key) => [key, stddev(rows.map((row) => row[key]))]));
  return rows.map((row) => ({
    ...row,
    vector: keys.map((key) => (row[key] - centers[key]) / spreads[key]),
  }));
}

function kmeans(rows, k) {
  if (rows.length <= k) return rows.map((row, cluster) => ({ ...row, cluster }));
  let centroids = [
    rows.reduce((best, row) => (row.igMedianValue > best.igMedianValue ? row : best), rows[0]).vector,
    rows.reduce((best, row) => (row.totalCount > best.totalCount ? row : best), rows[0]).vector,
    rows.reduce((best, row) => (row.interactionsPer1k > best.interactionsPer1k ? row : best), rows[0]).vector,
  ].slice(0, k);
  let assigned = rows.map((row) => ({ ...row, cluster: 0 }));

  for (let iter = 0; iter < 30; iter++) {
    assigned = rows.map((row) => {
      const distances = centroids.map((centroid) => euclidean(row.vector, centroid));
      const cluster = distances.indexOf(Math.min(...distances));
      return { ...row, cluster };
    });
    centroids = centroids.map((centroid, idx) => {
      const members = assigned.filter((row) => row.cluster === idx);
      if (members.length === 0) return centroid;
      return centroid.map((_, dim) => mean(members.map((row) => row.vector[dim])) ?? 0);
    });
  }
  return assigned;
}

function clusterName(members) {
  const avgVolume = mean(members.map((m) => m.totalCount)) ?? 0;
  const avgIgMedian = mean(members.map((m) => m.igMedianValue)) ?? 0;
  const avgFbShare = mean(members.map((m) => m.fbShare)) ?? 0;
  const avgEff = mean(members.map((m) => m.interactionsPer1k)) ?? 0;

  if (avgVolume >= 24 && avgFbShare >= 0.6) return 'Facebook-heavy calendar operators';
  if (avgIgMedian >= 0.65) return 'Instagram-efficient storytellers';
  if (avgEff >= 35) return 'High-response local pages';
  if (avgVolume >= 24) return 'High-volume mixed calendars';
  return 'Quiet or low-signal June presence';
}

function buildModelCards(model) {
  return model.clusters
    .map((cluster) => `
      <article class="model-card">
        <h3>${escapeHtml(cluster.name)}</h3>
        <p>${escapeHtml(cluster.read)}</p>
        <div class="pill-list">${cluster.members.map((member) => `<span>${escapeHtml(member)}</span>`).join('')}</div>
      </article>`)
    .join('');
}

function signalRows(signals) {
  return signals
    .map(
      (signal) => `
        <tr>
          <th>${escapeHtml(signal.label)}</th>
          <td>${escapeHtml(signal.value)}</td>
          <td>${escapeHtml(signal.read)}</td>
        </tr>`,
    )
    .join('');
}

function buildModeling(orgData, juneRows) {
  const clusterInput = orgData
    .filter((org) => org.totalCount > 0)
    .map((org) => ({
      id: org.id,
      name: org.short,
      totalCount: org.totalCount,
      igShare: org.totalCount > 0 ? org.igCount / org.totalCount : 0,
      fbShare: org.totalCount > 0 ? org.fbCount / org.totalCount : 0,
      igMedianValue: org.igMedian ?? 0,
      fbMedianValue: org.fbMedian ?? 0,
      interactionsPer1k: org.followers > 0 ? (org.interactions / org.followers) * 1000 : 0,
    }));
  const keys = ['totalCount', 'igShare', 'igMedianValue', 'fbMedianValue', 'interactionsPer1k'];
  const standardized = standardizeRows(clusterInput, keys);
  const clustered = kmeans(standardized, 3);
  const clusterIds = [...new Set(clustered.map((row) => row.cluster))];
  const clusters = clusterIds
    .map((id) => {
      const members = clustered.filter((row) => row.cluster === id);
      const containsRolf = members.some((row) => row.id === 'rolf');
      const name = containsRolf ? "ROLF's nearest operating set" : clusterName(members);
      const read = containsRolf
        ? 'ROLF lands here because it combines high June volume with a Facebook-heavy calendar and a better-than-expected Instagram rate.'
        : name === 'Instagram-efficient storytellers' || name === 'High-response local pages'
          ? 'These accounts turn fewer posts into stronger rates, usually through partner proof, carousels, or posts with a clear human context.'
          : name === 'High-volume mixed calendars'
            ? 'These accounts maintain a broad calendar and split effort across both channels.'
            : 'These accounts gave the crawl too little June signal to support strong creative conclusions.';
      return {
        name,
        read,
        members: members.map((row) => row.name),
      };
    })
    .sort((a, b) => (a.members.includes('ROLF') ? -1 : b.members.includes('ROLF') ? 1 : a.name.localeCompare(b.name)));

  const rolf = standardized.find((row) => row.id === 'rolf');
  const neighbors = standardized
    .filter((row) => row.id !== 'rolf')
    .map((row) => ({ name: row.name, distance: euclidean(row.vector, rolf.vector) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const igRows = juneRows.filter((row) => row.platform === 'instagram' && row.engagement_rate_public_pct !== null);
  const captionLengths = igRows.map((row) => row.caption_length_chars ?? 0);
  const hashtagCounts = igRows.map((row) => row.hashtags_count ?? 0);
  const engagement = igRows.map((row) => row.engagement_rate_public_pct);
  const formatMedians = ['reel', 'carousel', 'image_or_unknown'].map((format) => ({
    format,
    median: median(igRows.filter((row) => row.media_type_public === format).map((row) => row.engagement_rate_public_pct)),
    n: igRows.filter((row) => row.media_type_public === format).length,
  }));
  const bestFormat = [...formatMedians].sort((a, b) => (b.median ?? -1) - (a.median ?? -1))[0];
  const imageMedian = formatMedians.find((row) => row.format === 'image_or_unknown')?.median ?? null;

  return {
    clusters,
    nearest: neighbors.map((row) => row.name).join(', '),
    signals: [
      {
        label: 'K-means peer cluster',
        value: '5 features, k=3',
        read: `Closest peers to ROLF by standardized feature distance: ${neighbors.map((row) => row.name).join(', ')}.`,
      },
      {
        label: 'Caption length signal',
        value: `Spearman ${spearman(captionLengths, engagement)?.toFixed(2) ?? 'n/a'}`,
        read: 'Caption length did not show a strong monotonic relationship with Instagram engagement in this small June sample.',
      },
      {
        label: 'Hashtag count signal',
        value: `Spearman ${spearman(hashtagCounts, engagement)?.toFixed(2) ?? 'n/a'}`,
        read: 'More hashtags did not reliably mean stronger engagement. Packaging and subject matter look more important than tag volume.',
      },
      {
        label: 'Format signal',
        value: `${bestFormat.format === 'image_or_unknown' ? 'Images' : bestFormat.format}s: ${fmtPct(bestFormat.median)} median`,
        read:
          imageMedian === null || bestFormat.median === null
            ? 'The sample is too thin to rank formats.'
            : `The top format beat image posts by ${(bestFormat.median - imageMedian).toFixed(2)} percentage points, but format still needs human coding before it becomes a rule.`,
      },
    ],
  };
}

function topPostCards(posts) {
  return posts
    .map((post, index) => `
      <article class="post-card">
        <div class="rank">${index + 1}</div>
        <div>
          <h4>${escapeHtml(post.org)} <span>${escapeHtml(post.date)} · ${escapeHtml(post.type)}</span></h4>
          <p>${escapeHtml(post.caption)}</p>
          <a href="${escapeHtml(post.url)}">Open post</a>
        </div>
        <strong>${fmtPct(post.engagement)}</strong>
      </article>`)
    .join('');
}

function buildReport() {
  const rawRows = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
  const snapshots = parseCsv(fs.readFileSync(SNAPSHOTS_PATH, 'utf8'));
  const followerByOrgPlatform = new Map(
    snapshots.map((s) => [`${s.organization_id}|${s.platform}`, Number(s.follower_count_snapshot || 0)]),
  );

  const seen = new Set();
  const rows = [];
  for (const row of rawRows) {
    if (row.extraction_status !== 'complete') continue;
    const key = uniquePostKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  const allOrgIds = Object.keys(ORG_LABELS);
  const reportRows = rows.filter((r) => allOrgIds.includes(r.organization_id));
  const reportRawRows = rawRows.filter((r) => allOrgIds.includes(r.organization_id));
  const juneRows = reportRows.filter((r) => r.in_june_window);
  const peerOrgIds = allOrgIds.filter((id) => id !== 'rolf');

  const orgData = allOrgIds.map((id) => {
    const june = juneRows.filter((r) => r.organization_id === id);
    const ig = june.filter((r) => r.platform === 'instagram');
    const fb = june.filter((r) => r.platform === 'facebook');
    const followers =
      (followerByOrgPlatform.get(`${id}|instagram`) ?? 0) +
      (followerByOrgPlatform.get(`${id}|facebook`) ?? 0);
    return {
      id,
      name: ORG_LABELS[id],
      short: SHORT_LABELS[id],
      igCount: ig.length,
      fbCount: fb.length,
      totalCount: june.length,
      followers,
      igMedian: median(ig.map((r) => r.engagement_rate_public_pct)),
      fbMedian: median(fb.map((r) => r.engagement_rate_public_pct)),
      overallMedian: median(june.map((r) => r.engagement_rate_public_pct)),
      interactions: june.reduce((sum, r) => sum + (r.public_interactions_count ?? 0), 0),
    };
  });

  const rolf = orgData.find((d) => d.id === 'rolf');
  const peersWithJune = orgData.filter((d) => peerOrgIds.includes(d.id));
  const peerMedianPosts = median(peersWithJune.map((d) => d.totalCount));
  const peerMedianIg = median(peersWithJune.map((d) => d.igMedian).filter((v) => v !== null));
  const peerMedianFb = median(peersWithJune.map((d) => d.fbMedian).filter((v) => v !== null));
  const peerMedianAll = median(peersWithJune.map((d) => d.overallMedian).filter((v) => v !== null));

  const volumeData = [...orgData].sort((a, b) => b.totalCount - a.totalCount).map((d) => ({
    id: d.id,
    short: d.short,
    ig: d.igCount,
    fb: d.fbCount,
  }));
  const engagementData = [...orgData].sort((a, b) => (b.igMedian ?? -1) - (a.igMedian ?? -1)).map((d) => ({
    id: d.id,
    short: d.short,
    ig: d.igMedian,
    fb: d.fbMedian,
  }));
  const scatterData = orgData.filter((d) => d.totalCount > 0).map((d) => ({
    id: d.id,
    short: d.short,
    followers: d.followers,
    interactions: d.interactions,
  }));

  const igJune = juneRows.filter((r) => r.platform === 'instagram');
  const formatLabels = [
    ['reel', 'Reels'],
    ['carousel', 'Carousels'],
    ['image_or_unknown', 'Images'],
  ];
  const formatData = formatLabels.map(([key, label]) => {
    const peerValues = igJune
      .filter((r) => r.organization_id !== 'rolf' && allOrgIds.includes(r.organization_id) && r.media_type_public === key)
      .map((r) => r.engagement_rate_public_pct);
    const rolfValues = igJune
      .filter((r) => r.organization_id === 'rolf' && r.media_type_public === key)
      .map((r) => r.engagement_rate_public_pct);
    return {
      label,
      peerMedian: median(peerValues),
      rolfMedian: median(rolfValues),
      peerN: peerValues.length,
      rolfN: rolfValues.length,
    };
  });

  const topIgPosts = [...igJune]
    .filter((r) => r.engagement_rate_public_pct !== null)
    .sort((a, b) => b.engagement_rate_public_pct - a.engagement_rate_public_pct)
    .slice(0, 6)
    .map((r) => ({
      org: ORG_LABELS[r.organization_id],
      date: niceDate(r.published_at),
      type: r.media_type_public === 'image_or_unknown' ? 'image' : r.media_type_public,
      engagement: r.engagement_rate_public_pct,
      url: r.post_url,
      caption: normalizeCaption(r.caption_text).slice(0, 170) || 'Caption unavailable from public page.',
    }));

  const sampleCoverage = {
    collected: reportRawRows.length,
    unique: reportRows.length,
    june: juneRows.length,
    juneIg: juneRows.filter((r) => r.platform === 'instagram').length,
    juneFb: juneRows.filter((r) => r.platform === 'facebook').length,
  };
  const toneRows = juneRows.map((row) => ({ ...row, tone: analyzeTone(row.caption_text) }));
  const toneData = orgData.map((org) => {
    const orgToneRows = toneRows.filter((row) => row.organization_id === org.id && row.tone.label !== 'No caption');
    const counts = { Uplifting: 0, Informational: 0, 'Need-focused': 0 };
    for (const row of orgToneRows) counts[row.tone.label] += 1;
    const scores = orgToneRows.map((row) => row.tone.score);
    return {
      id: org.id,
      short: org.short,
      counts,
      total: orgToneRows.length,
      avgScore: mean(scores),
    };
  });
  const rolfTone = toneData.find((row) => row.id === 'rolf');
  const rolfToneDominant = rolfTone
    ? Object.entries(rolfTone.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Informational'
    : 'Informational';
  const modeling = buildModeling(orgData, juneRows);

  return { orgData, rolf, peerMedianPosts, peerMedianIg, peerMedianFb, peerMedianAll, volumeData, engagementData, scatterData, formatData, topIgPosts, sampleCoverage, toneData, rolfToneDominant, modeling };
}

const report = buildReport();

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>River of Life Social Media Audit</title>
  <style>
    :root {
      --ink: ${COLORS.ink};
      --muted: ${COLORS.muted};
      --rule: ${COLORS.rule};
      --paper: ${COLORS.paper};
      --panel: ${COLORS.panel};
      --blue: ${COLORS.blue};
      --orange: ${COLORS.orange};
      --green: ${COLORS.green};
      --gold: ${COLORS.gold};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .wrap { width: min(1160px, calc(100% - 36px)); margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--rule);
      background: #fffdf9;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
      gap: 44px;
      padding: 58px 0 42px;
      align-items: end;
    }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--orange);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(2.3rem, 6vw, 5.1rem);
      line-height: .95;
      letter-spacing: 0;
      max-width: 780px;
    }
    .hero-copy {
      margin: 22px 0 0;
      max-width: 720px;
      font-size: 1.13rem;
      color: #3d434a;
    }
    .scope {
      padding: 18px 20px;
      border: 1px solid var(--rule);
      background: var(--panel);
      border-radius: 8px;
    }
    .scope h2 { margin: 0 0 12px; font-size: 1rem; }
    .scope dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0; }
    .scope dt { color: var(--muted); font-size: .88rem; }
    .scope dd { margin: 0; font-weight: 700; }
    main { padding: 32px 0 72px; }
    section { padding: 34px 0; border-bottom: 1px solid var(--rule); }
    section:last-child { border-bottom: 0; }
    .section-head {
      display: grid;
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: 38px;
      align-items: start;
      margin-bottom: 24px;
    }
    .section-head h2 {
      margin: 0;
      font-size: clamp(1.6rem, 3vw, 2.5rem);
      line-height: 1.05;
      letter-spacing: 0;
    }
    .section-head p { margin: 0; color: #3d434a; font-size: 1.02rem; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .kpi {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 18px;
      min-height: 132px;
    }
    .kpi strong { display: block; font-size: clamp(1.7rem, 4vw, 3rem); line-height: 1; margin-bottom: 10px; }
    .kpi span { color: var(--muted); font-size: .92rem; }
    .findings {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .finding {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 20px;
    }
    .finding h3 { margin: 0 0 10px; font-size: 1.04rem; }
    .finding p { margin: 0; color: #414850; }
    .plain-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin: 20px 0;
    }
    .plain-summary article {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 18px;
    }
    .plain-summary strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1.5rem;
    }
    .plain-summary span { color: var(--muted); }
    .org-roster {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .org-card {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 16px;
    }
    .org-card h3 { margin: 0 0 10px; font-size: 1rem; }
    .org-card dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 5px 12px;
      margin: 0;
      font-size: .9rem;
    }
    .org-card dt { color: var(--muted); }
    .org-card dd { margin: 0; font-weight: 800; }
    .chart-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 22px;
    }
    .chart-block {
      margin: 0;
      padding: 20px 20px 14px;
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      overflow-x: auto;
    }
    .chart-block figcaption {
      display: grid;
      grid-template-columns: minmax(220px, .7fr) minmax(280px, 1.3fr);
      gap: 24px;
      margin-bottom: 10px;
    }
    .chart-block h3 { margin: 0; font-size: 1.14rem; }
    .chart-block p { margin: 0; color: var(--muted); }
    svg { width: 100%; min-width: 0; display: block; }
    .grid { stroke: #e8ebef; stroke-width: 1; }
    .axis, .legend, .chart-label, .chart-value, .point-label {
      font-size: 13px;
      fill: #4d5560;
    }
    .axis-title { font-size: 13px; font-weight: 800; fill: #333941; }
    .chart-value { font-weight: 700; fill: #2d333a; }
    .org-focus, .focus-label { font-weight: 900; fill: var(--orange); }
    .recommendations {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .recommendation {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-left: 6px solid var(--green);
      border-radius: 8px;
      padding: 20px 22px;
    }
    .recommendation:nth-child(2) { border-left-color: var(--orange); }
    .recommendation:nth-child(3) { border-left-color: var(--blue); }
    .recommendation:nth-child(4) { border-left-color: var(--gold); }
    .recommendation h3 { margin: 0 0 9px; font-size: 1.08rem; }
    .recommendation p { margin: 0; color: #414850; }
    .model-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .model-card {
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 18px;
    }
    .model-card h3 { margin: 0 0 9px; font-size: 1.02rem; }
    .model-card p { margin: 0 0 14px; color: #414850; }
    .pill-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .pill-list span {
      display: inline-flex;
      padding: 4px 8px;
      border: 1px solid #d7e1dc;
      border-radius: 999px;
      background: #f5faf8;
      color: #2f5f50;
      font-size: .82rem;
      font-weight: 700;
    }
    .signal-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      overflow: hidden;
    }
    .signal-table th, .signal-table td {
      padding: 13px 14px;
      border-bottom: 1px solid var(--rule);
      text-align: left;
      vertical-align: top;
    }
    .signal-table tr:last-child th, .signal-table tr:last-child td { border-bottom: 0; }
    .signal-table th { width: 28%; color: var(--ink); }
    .signal-table td:first-of-type { width: 20%; font-weight: 800; color: var(--orange); white-space: nowrap; }
    .post-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .post-card {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 14px;
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 16px;
    }
    .rank {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: #eef5f2;
      color: var(--green);
      font-weight: 900;
    }
    .post-card h4 { margin: 0 0 6px; font-size: .98rem; }
    .post-card h4 span { color: var(--muted); font-weight: 600; }
    .post-card p { margin: 0 0 8px; color: #424950; font-size: .92rem; }
    .post-card strong { color: var(--orange); white-space: nowrap; }
    .note {
      margin-top: 20px;
      padding: 16px 18px;
      background: #fff7e8;
      border: 1px solid #eed19a;
      border-radius: 8px;
      color: #4e3b12;
    }
    footer {
      padding: 28px 0 42px;
      color: var(--muted);
      font-size: .92rem;
    }
    @media (max-width: 860px) {
      .hero, .section-head, .chart-block figcaption, .recommendations, .post-list, .model-grid { grid-template-columns: 1fr; }
      .kpis, .findings, .plain-summary, .org-roster { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      .wrap { width: min(100% - 24px, 1160px); }
      .hero { padding-top: 36px; gap: 24px; }
      .kpis, .findings, .plain-summary, .org-roster { grid-template-columns: 1fr; }
      .post-card { grid-template-columns: 32px minmax(0, 1fr); }
      .post-card strong { grid-column: 2; }
      .signal-table, .signal-table tbody, .signal-table tr, .signal-table th, .signal-table td { display: block; width: 100%; }
      .signal-table { border: 0; background: transparent; }
      .signal-table tr {
        margin-bottom: 12px;
        border: 1px solid var(--rule);
        border-radius: 8px;
        background: var(--panel);
        overflow: hidden;
      }
      .signal-table th, .signal-table td { border-bottom: 0; }
      .signal-table th { padding-bottom: 4px; }
      .signal-table td:first-of-type { padding-top: 0; white-space: normal; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap hero">
      <div>
        <p class="eyebrow">River of Life Foundation social audit</p>
        <h1>What ROLF can learn from 7 local nonprofit peers.</h1>
        <p class="hero-copy">This report compares River of Life Foundation with nearby food, housing, and safety-net nonprofits on Instagram and Facebook. The short version: ROLF is posting enough to be seen. The next improvement is making each post easier to understand, feel, and act on.</p>
      </div>
      <aside class="scope" aria-label="report scope">
        <h2>Report scope</h2>
        <dl>
          <dt>Collection window</dt><dd>June 2026 posts, collected July 14-15</dd>
          <dt>Platforms</dt><dd>Instagram and Facebook</dd>
          <dt>Collected rows</dt><dd>${fmtNum(report.sampleCoverage.collected)}</dd>
          <dt>Unique analyzed posts</dt><dd>${fmtNum(report.sampleCoverage.unique)}</dd>
          <dt>June posts analyzed</dt><dd>${fmtNum(report.sampleCoverage.june)}</dd>
        </dl>
      </aside>
    </div>
  </header>
  <main class="wrap">
    <section>
      <div class="section-head">
        <h2>Who was included</h2>
        <p>The audit covered River of Life Foundation plus seven peer nonprofits. The counts below show June posts used in the analysis after removing repeated Facebook photo variants.</p>
      </div>
      <div class="plain-summary">
        <article><strong>8 nonprofits</strong><span>ROLF plus seven peer organizations</span></article>
        <article><strong>${fmtNum(report.sampleCoverage.collected)} posts collected</strong><span>Raw Instagram and Facebook rows before cleanup</span></article>
        <article><strong>${fmtNum(report.sampleCoverage.june)} June posts analyzed</strong><span>${fmtNum(report.sampleCoverage.juneIg)} Instagram and ${fmtNum(report.sampleCoverage.juneFb)} Facebook posts</span></article>
      </div>
      <div class="org-roster">
        ${rosterCards(report.orgData)}
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Executive read</h2>
        <p>ROLF sits in the middle of the peer set on total June engagement. Instagram delivered the stronger rate on a small base. Facebook supplied most of ROLF's June posts.</p>
      </div>
      <div class="kpis">
        <div class="kpi"><strong>${fmtNum(report.rolf.totalCount)}</strong><span>ROLF June posts analyzed after duplicate photo cleanup</span></div>
        <div class="kpi"><strong>${fmtPct(report.rolf.igMedian)}</strong><span>ROLF median Instagram engagement, above the peer median of ${fmtPct(report.peerMedianIg)}</span></div>
        <div class="kpi"><strong>${fmtPct(report.rolf.fbMedian)}</strong><span>ROLF median Facebook engagement, above the peer median of ${fmtPct(report.peerMedianFb)}</span></div>
        <div class="kpi"><strong>${fmtNum(report.rolf.interactions)}</strong><span>ROLF public interactions on June posts after duplicate cleanup</span></div>
      </div>
      <div class="findings">
        <article class="finding">
          <h3>Instagram is underused, not weak.</h3>
          <p>ROLF posted only ${report.rolf.igCount} June Instagram items, but those posts held a median engagement rate of ${fmtPct(report.rolf.igMedian)}. That beats the peer median. The sample is small, so the right move is controlled expansion, not a victory lap.</p>
        </article>
        <article class="finding">
          <h3>Facebook carries the calendar.</h3>
          <p>${report.rolf.fbCount} of ROLF's ${report.rolf.totalCount} June posts came from Facebook. The platform gives ROLF reliable distribution, but repeated service-schedule posts cap the ceiling unless they get stronger story packaging.</p>
        </article>
        <article class="finding">
          <h3>The peer winners show proof.</h3>
          <p>Sacred Heart, Martha's Kitchen, Sunnyvale, and Sunday Friends earned their best rates with posts that tied the service to people, partners, or a concrete local need. The strongest posts did not read like flyers.</p>
        </article>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Where ROLF sits</h2>
        <p>The charts use unique June posts after collapsing duplicate Facebook photo variants. Engagement rate means public interactions divided by the follower snapshot for that account.</p>
      </div>
      <div class="chart-grid">
        ${chartFrame('June posting volume', 'West Valley and ROLF posted the most June content in this peer set. ROLF was active enough to compete; the question is whether each post earns attention.', stackedVolumeChart(report.volumeData))}
        ${chartFrame('Median engagement rate by platform', 'ROLF is stronger on Instagram than its small count suggests. Facebook looks steadier than several larger peers, but Sunday Friends shows what a smaller organization can do when posts travel.', engagementChart(report.engagementData))}
        ${chartFrame('Audience efficiency', 'This view normalizes public interactions by follower count. It avoids rewarding larger pages just for being larger.', scatterChart(report.scatterData))}
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Caption sentiment</h2>
        <p>I scored captions with a simple nonprofit-specific dictionary. “Uplifting” captures thanks, hope, partnership, and community language. “Need-focused” captures hunger, homelessness, cost pressure, and direct-need language. This is a tone read, not a psychological read.</p>
      </div>
      ${chartFrame('Caption tone by nonprofit', `ROLF's dominant caption tone in June was ${report.rolfToneDominant.toLowerCase()}. The stronger peer posts often paired need language with proof or gratitude, which kept the post from reading like a plain announcement.`, toneChart(report.toneData))}
      <div class="findings">
        <article class="finding">
          <h3>Need language is useful when it has proof.</h3>
          <p>Posts about hunger, school supplies, or housing pressure performed best when they showed a concrete response: meals, supplies, partners, volunteers, or families reached.</p>
        </article>
        <article class="finding">
          <h3>Gratitude travels well.</h3>
          <p>Peer posts thanking partners, volunteers, and donors gave readers an easy emotional entry point. ROLF can use that more often without sounding promotional.</p>
        </article>
        <article class="finding">
          <h3>Pure information is necessary, but limited.</h3>
          <p>Service hours and schedule posts should stay in the mix. They need a second layer when the goal is reach: one number, one person, or one result.</p>
        </article>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Pattern finder</h2>
        <p>I used three lightweight machine-learning techniques to look for patterns: grouping similar nonprofits, finding ROLF's nearest peers, and checking whether simple caption features move with engagement. These results guide questions; they do not prove cause and effect.</p>
      </div>
      <div class="model-grid">
        ${buildModelCards(report.modeling)}
      </div>
      <table class="signal-table">
        <tbody>
          ${signalRows(report.modeling.signals)}
        </tbody>
      </table>
      <p class="note">Model inputs: June post volume, Instagram share of activity, median Instagram engagement, median Facebook engagement, and interactions per 1,000 combined followers.</p>
    </section>

    <section>
      <div class="section-head">
        <h2>Creative patterns</h2>
        <p>Format alone does not explain performance. Reels had the highest peer median on Instagram, but the sample is thin. Carousels gave Sacred Heart and Martha's Kitchen a repeatable way to package need, proof, and a call to act.</p>
      </div>
      ${chartFrame('Instagram format benchmark', 'ROLF only had carousels and image posts in the June Instagram sample. It can test Reels without abandoning carousels, which already clear the peer median.', formatChart(report.formatData))}
      <div class="recommendations">
        <article class="recommendation">
          <h3>Turn service posts into proof posts.</h3>
          <p>Keep pantry hours and schedule posts, but add one visible outcome: meals packed, families served, volunteer shift filled, or a partner contribution. Readers need a number or a scene before they need a reminder.</p>
        </article>
        <article class="recommendation">
          <h3>Use Instagram for the best 2-3 stories each week.</h3>
          <p>ROLF's Instagram rate is good on too few posts. Start with two planned posts per week: one service proof carousel, one human or volunteer story. Add Reels only when there is motion worth seeing.</p>
        </article>
        <article class="recommendation">
          <h3>Write captions with one job.</h3>
          <p>Several ROLF captions combine bilingual copy, program context, hashtags, and logistics. Keep bilingual access, but make the first two lines do the work: need, proof, next step.</p>
        </article>
        <article class="recommendation">
          <h3>Measure shares and saves by proxy.</h3>
          <p>The public crawl sees likes, comments, and visible Facebook shares. For ROLF's own accounts, add native saves, profile visits, and link clicks before changing the calendar. Public engagement is only the outside view.</p>
        </article>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Posts worth studying</h2>
        <p>These Instagram posts led the June peer set by public engagement rate. The common thread is not polish. Each post gives the reader a concrete reason to care.</p>
      </div>
      <div class="post-list">
        ${topPostCards(report.topIgPosts)}
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>How to use this</h2>
        <p>This report should guide the first working session, not close the strategy. The next pass should add manual coding for theme, CTA, human presence, and impact packaging, then compare those choices against the public performance data.</p>
      </div>
      <div class="recommendations">
        <article class="recommendation">
          <h3>First 30 days</h3>
          <p>Run a simple content rhythm: two Instagram posts and three Facebook posts per week. Every post gets one of three labels before it is made: service access, proof of impact, or invitation to help.</p>
        </article>
        <article class="recommendation">
          <h3>First dashboard</h3>
          <p>Track posting count, engagement rate, comments, shares, profile visits, and link clicks by post type. Review weekly, but make creative changes monthly so one noisy post does not steer the program.</p>
        </article>
        <article class="recommendation">
          <h3>First creative test</h3>
          <p>Take one pantry update and publish it three ways: a flyer-style post, a proof carousel, and a 20-second volunteer reel. Keep the CTA constant so the packaging test means something.</p>
        </article>
        <article class="recommendation">
          <h3>Data caveat</h3>
          <p>The crawl uses public metrics only. LinkedIn manual collection and native account analytics can change the channel recommendation, especially if donors or partners engage more heavily there.</p>
        </article>
      </div>
    </section>
  </main>
  <footer class="wrap">
    Built from local audit files in <code>data/normalized</code>. Duplicate Facebook photo variants were collapsed for analysis. Report generated by <code>scripts/build-report-site.mjs</code>.
  </footer>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log(`Wrote ${OUT_PATH}`);
