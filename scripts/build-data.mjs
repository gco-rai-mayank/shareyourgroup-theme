// Pulls the group list from the Apps Script and writes data/groups.json (small + fast to load).
// Runs on GitHub Actions every 15 minutes. Node 20+, no packages needed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = process.env.APPS_SCRIPT_URL;
const OUT = new URL('../data/groups.json', import.meta.url);
const BAD_NAME = /^(error fetching name|fetching\.*|whatsapp group invite|whatsapp channel|whatsapp|\.+)?$/i;
const CODE_RE = /(?:chat\.whatsapp\.com\/(?:invite\/)?|whatsapp\.com\/(channel)\/)([A-Za-z0-9]{15,40})/;

if (!API) throw new Error('APPS_SCRIPT_URL secret is not set');

async function fetchList() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(API, { redirect: 'follow', signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected response');
      return data;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw lastErr;
}

function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// WhatsApp photo links carry an expiry (oe=<hex unix time>). Drop ones that are already dead.
function image(url) {
  if (!/^https:\/\/pps\.whatsapp\.net\//.test(url || '')) return '';
  const oe = /[?&]oe=([0-9A-Fa-f]+)/.exec(url);
  if (oe && parseInt(oe[1], 16) * 1000 < Date.now()) return '';
  return url;
}

const raw = await fetchList();
const seen = new Set();
const groups = [];
for (const r of raw) {
  const link = String(r.group_link || '').split('?')[0];
  const m = CODE_RE.exec(link);
  const name = decode(r.group_name);
  if (!m || BAD_NAME.test(name) || seen.has(m[2])) continue;
  seen.add(m[2]);
  const g = { id: m[2], n: name, l: link, t: Date.parse(r.timestamp) || 0 };
  const img = image(r.group_image);
  if (img) g.i = img;
  if (r.category) g.c = String(r.category);
  if (r.description) g.d = decode(r.description).slice(0, 200);
  if (m[1] === 'channel') g.ch = 1;
  if (r.topic) g.p = String(r.topic);
  groups.push(g);
}
groups.sort((a, b) => b.t - a.t);

// Safety: never replace a good list with a broken one
let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const prevCount = previous?.groups?.length || 0;
if (prevCount && groups.length < prevCount * 0.5 && !process.env.FORCE) {
  throw new Error(`Only ${groups.length} groups (was ${prevCount}). Not overwriting. Set FORCE=1 to override.`);
}

const same = previous && JSON.stringify(previous.groups) === JSON.stringify(groups);
if (same) {
  console.log(`No changes (${groups.length} groups).`);
} else {
  const updated = new Date().toISOString();
  await mkdir(new URL('../data/topics/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify({ v: 2, updated, count: groups.length, groups }));

  // One small file per blog-post list, so a post only downloads its own groups
  const topics = {};
  for (const g of groups) for (const t of (g.p || '').split(',').filter(Boolean)) (topics[t] ||= []).push(g);
  for (const [t, list] of Object.entries(topics)) {
    if (!/^[A-Za-z0-9_-]{2,60}$/.test(t)) continue;
    await writeFile(new URL(`../data/topics/${t}.json`, import.meta.url), JSON.stringify({ v: 2, updated, topic: t, count: list.length, groups: list }));
  }
  console.log(`Wrote ${groups.length} groups and ${Object.keys(topics).length} topic lists (was ${prevCount}).`);
}
