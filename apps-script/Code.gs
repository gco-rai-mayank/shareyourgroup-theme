/**
 * ShareYourGroup — Google Apps Script backend (v2)
 *
 * Replaces the old Code, RefreshXMLBatch, RemoveError, Duplicate, Filter and RandomDates files.
 * Setup (once): paste this file, run migrateV2(), then run setup(). Then Deploy > Manage deployments >
 * edit the existing web app > Version: New version. The URL stays the same.
 *
 * Why it's faster: names and photos are stored as plain values. The old IMPORTXML formulas made Google
 * Sheets re-download every group page on each request (13+ seconds, and "Error fetching name").
 */

const CONFIG = {
  SHEET: 'Group Links',
  REPORTS_TO_HIDE: 3,        // a listing is hidden after this many reports
  MAX_CHECKS: 3,             // failed look-ups before a link is marked dead
  REBUMP_HOURS: 24,          // re-submitting a live group moves it to the top at most once per day
  BUMP_RANDOM_DAILY: 20,     // groups moved to the top each morning (0 = off). Same as the old RandomDates script.
  RECHECK_PER_RUN: 100,      // live groups re-checked per run (also refreshes their photo, which WhatsApp expires)
  DESC_MAX: 200
};

// Columns A..L. "topic" = which blog-post list(s) a group belongs to, comma-separated (see Topics.gs).
const COL = { LINK: 1, TIME: 2, NAME: 3, IMAGE: 4, CAT: 5, DESC: 6, STATUS: 7, CHECKS: 8, CHECKED: 9, REPORTS: 10, ADDED: 11, TOPIC: 12 };
const HEADERS = ['group_link', 'timestamp', 'group_name', 'group_image', 'category', 'description', 'status', 'checks', 'last_checked', 'reports', 'added', 'topic'];
const TOPIC_RE = /^[A-Za-z0-9_-]{2,60}$/;

function addTopic(list, topic) {
  const parts = String(list || '').split(',').filter(Boolean);
  if (topic && parts.indexOf(topic) < 0) parts.push(topic);
  return parts.join(',');
}

// Must match the ids in assets/syg.js
const CATEGORIES = ['education', 'jobs', 'stocks', 'earning', 'business', 'shopping', 'tech', 'gaming', 'entertainment', 'music', 'fun',
  'friendship', 'love', 'quotes', 'news', 'sports', 'religion', 'travel', 'health', 'food', 'others'];

// Whole-word matches only, so "analysis" no longer matches "anal" and "studies" no longer matches "die".
// EDIT: add or remove words here.
const BLOCKED = [
  // adult
  'porn', 'porno', 'xxx', 'sex', 'sexy', 'nude', 'nudes', 'erotic', 'adult', '18+', 'milf', 'blowjob', 'escort', 'escorts', 'call girl', 'call girls',
  'hot girl', 'hot girls', 'hot video', 'hot videos', 'bdsm', 'bokep', 'onlyfans', 'nangi', 'desi bhabhi', 'sex chat', 'video call girl',
  // abuse
  'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'randi', 'chut', 'gaand', 'gandu', 'bhosdike', 'bhosadike', 'lund', 'fucker', 'slut', 'whore',
  // hate
  'nigger', 'faggot', 'kike', 'chink', 'raghead', 'pajeet',
  // drugs
  'cocaine', 'heroin', 'meth', 'mdma', 'lsd', 'ganja', 'charas', 'brown sugar', 'chitta',
  // scams
  'money doubling', 'double your money', 'guaranteed profit', '100% profit', 'free recharge', 'win iphone', 'lottery', 'jackpot',
  'otp', 'virtual number', 'virtual numbers', 'usa numbers', 'fake id', 'hacked', 'carding', 'bitcoin scam', 'crypto scam',
  // extremism
  'isis', 'daesh', 'al-qaeda', 'al qaeda', 'taliban', 'lashkar', 'jaish'
];
const BLOCKED_RE = new RegExp('(?:^|[^\\p{L}\\p{N}])(?:' + BLOCKED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu');
const GENERIC_NAME = /^(error fetching name|fetching\.*|whatsapp group invite|whatsapp channel|whatsapp|\.+)?$/i;
const LINK_RE = /^https:\/\/(?:chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{15,40})|(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]{15,40}))$/;

/* ------------------------------------------------------------------ web app */

/**
 * GET            → every live group (used by the GitHub job every 15 min)
 * GET ?since=ISO → only groups added or bumped after that time (used by every visitor, so new
 *                  submissions show up for everyone right away). Cached for 60 seconds.
 */
function doGet(e) {
  const since = e && e.parameter && Date.parse(e.parameter.since);
  if (since) {
    const cache = CacheService.getScriptCache();
    const key = 'since_' + Math.floor(since / 1000) + '_' + (cache.get('gen') || 0);   // "gen" changes on every new listing
    const hit = cache.get(key);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    const body = JSON.stringify(liveRows(r => new Date(r.time).getTime() > since));
    if (body.length < 90000) cache.put(key, body, 60);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return json(liveRows());
}

function liveRows(filter) {
  const out = [];
  readRows().forEach(r => {
    // rows without a status are from before migrateV2(); show them if they have a real name
    if (r.status ? r.status !== 'live' : GENERIC_NAME.test(clean(r.name))) return;
    if (filter && !filter(r)) return;
    out.push({
      group_link: r.link,
      timestamp: r.time,
      group_name: r.name,
      group_image: r.image,
      category: r.cat,
      description: r.desc,
      topic: r.topic
    });
  });
  return out;
}

function doPost(e) {
  let data = {};
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json({ ok: false, message: 'Bad request' }); }
  if (data.action === 'report') return json(report(data));
  return json(submit(data));
}

function submit(data) {
  const parsed = parseLink(data.group_link);
  if (!parsed) return { ok: false, message: 'Please paste a valid WhatsApp group or channel link.' };
  const cat = CATEGORIES.indexOf(data.category) > -1 ? data.category : '';
  const desc = clean(data.description).slice(0, CONFIG.DESC_MAX);
  const topic = TOPIC_RE.test(data.topic || '') ? data.topic : '';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, message: 'Busy — please try again in a moment.' };
  try {
    const sheet = getSheet();
    const rows = readRows(sheet);
    const now = new Date();
    const existing = rows.find(r => r.code === parsed.code);

    if (existing && existing.status === 'live') {
      const fresh = now - new Date(existing.time) < CONFIG.REBUMP_HOURS * 3600e3;
      if (!fresh) sheet.getRange(existing.row, COL.TIME).setValue(now);
      if (cat && !existing.cat) sheet.getRange(existing.row, COL.CAT).setValue(cat);
      if (desc && !existing.desc) sheet.getRange(existing.row, COL.DESC).setValue(desc);
      if (topic && addTopic(existing.topic, topic) !== existing.topic) sheet.getRange(existing.row, COL.TOPIC).setValue(addTopic(existing.topic, topic));
      return { ok: true, status: 'live', duplicate: true, name: existing.name, image: existing.image,
        message: fresh ? 'This group is already listed. 👍' : 'Already listed — we bumped it back to the top! 🚀' };
    }
    if (existing && (existing.status === 'rejected' || existing.status === 'hidden')) {
      return { ok: true, status: 'rejected', message: 'This group can’t be listed because it breaks our rules.' };
    }

    const meta = fetchMeta(parsed.link);
    let status = meta.name ? 'live' : 'pending';
    if (isBlocked(meta.name + ' ' + desc)) status = 'rejected';

    const values = [parsed.link, now, meta.name, meta.image, cat, desc, status, meta.name ? 0 : 1, now, 0, now, addTopic(existing && existing.topic, topic)];
    if (existing) sheet.getRange(existing.row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    if (status === 'live') CacheService.getScriptCache().put('gen', String(Date.now()), 21600);

    if (status === 'rejected') return { ok: true, status, message: 'This group can’t be listed because it breaks our rules.' };
    if (status === 'pending') return { ok: true, status, message: 'Got it! We couldn’t read the group details yet — we’ll retry automatically and it will appear soon.' };
    return { ok: true, status, name: meta.name, image: meta.image, message: 'You’re live! Share your listing to get members faster.' };
  } finally {
    lock.releaseLock();
  }
}

function report(data) {
  const parsed = parseLink(data.group_link);
  if (!parsed) return { ok: false };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false };
  try {
    const sheet = getSheet();
    const r = readRows(sheet).find(x => x.code === parsed.code);
    if (!r) return { ok: true };
    const n = (Number(r.reports) || 0) + 1;
    sheet.getRange(r.row, COL.REPORTS).setValue(n);
    if (n >= CONFIG.REPORTS_TO_HIDE && r.status === 'live') sheet.getRange(r.row, COL.STATUS).setValue('hidden');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ scheduled jobs */

/** Every hour: retry groups whose details couldn't be read yet. */
function repairPending() {
  const sheet = getSheet();
  const todo = readRows(sheet).filter(r => r.status === 'pending').slice(0, 60);
  checkRows(sheet, todo);
}

/** Every 6 hours: re-check the least recently checked live groups (removes dead links, refreshes photos). */
function recheckLive() {
  const sheet = getSheet();
  const todo = readRows(sheet).filter(r => r.status === 'live')
    .sort((a, b) => (new Date(a.checked || 0)) - (new Date(b.checked || 0)))
    .slice(0, CONFIG.RECHECK_PER_RUN);
  checkRows(sheet, todo);
}

/** Every morning: move a few random live groups to the top (same idea as the old RandomDates script). */
function bumpRandom() {
  if (!CONFIG.BUMP_RANDOM_DAILY) return;
  const sheet = getSheet();
  const live = readRows(sheet).filter(r => r.status === 'live');
  const now = new Date();
  for (let i = 0; i < CONFIG.BUMP_RANDOM_DAILY && live.length; i++) {
    const r = live.splice(Math.floor(Math.random() * live.length), 1)[0];
    sheet.getRange(r.row, COL.TIME).setValue(now);
  }
}

function checkRows(sheet, rows) {
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const metas = fetchMetaMany(batch.map(r => r.link));
    const now = new Date();
    batch.forEach((r, k) => {
      const m = metas[k];
      if (m.name) {
        const status = r.status === 'pending' ? (isBlocked(m.name + ' ' + r.desc) ? 'rejected' : 'live') : r.status;
        sheet.getRange(r.row, COL.NAME, 1, 2).setValues([[m.name, m.image || r.image]]);
        sheet.getRange(r.row, COL.STATUS, 1, 3).setValues([[status, 0, now]]);
      } else {
        const checks = (Number(r.checks) || 0) + 1;
        sheet.getRange(r.row, COL.STATUS, 1, 3).setValues([[checks >= CONFIG.MAX_CHECKS ? 'dead' : r.status, checks, now]]);
      }
    });
  }
}

/* ------------------------------------------------------------------ one-time setup */

/**
 * Run ONCE. Converts the old IMPORTXML formulas to plain values, adds the new columns,
 * marks duplicates / blocked / unreadable rows instead of deleting them. Safe to run again.
 */
function migrateV2() {
  const sheet = getSheet();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  const last = sheet.getLastRow();
  if (last < 2) return;
  const range = sheet.getRange(2, 1, last - 1, HEADERS.length);
  const shown = range.getDisplayValues();          // what the formulas currently show
  const raw = range.getValues();
  const seen = {};
  const out = raw.map((row, i) => {
    const parsed = parseLink(String(row[0]));
    const name = clean(shown[i][COL.NAME - 1]);
    let image = String(shown[i][COL.IMAGE - 1] || '');
    if (!/^https:\/\/pps\.whatsapp\.net\//.test(image)) image = '';
    let status = String(row[COL.STATUS - 1] || '');
    if (!status) {
      if (!parsed) status = 'dead';
      else if (seen[parsed.code]) status = 'duplicate';
      else if (GENERIC_NAME.test(name)) status = 'pending';
      else status = isBlocked(name) ? 'rejected' : 'live';
    }
    if (parsed) seen[parsed.code] = true;
    return [
      parsed ? parsed.link : row[0],
      row[COL.TIME - 1] || new Date(),
      GENERIC_NAME.test(name) ? '' : name,
      image,
      row[COL.CAT - 1] || '',
      row[COL.DESC - 1] || '',
      status,
      row[COL.CHECKS - 1] || 0,
      row[COL.CHECKED - 1] || '',
      row[COL.REPORTS - 1] || 0,
      row[COL.ADDED - 1] || row[COL.TIME - 1] || new Date(),
      row[COL.TOPIC - 1] || ''
    ];
  });
  range.setValues(out);                            // overwrites the formulas with values
  SpreadsheetApp.flush();
  const count = s => out.filter(r => r[COL.STATUS - 1] === s).length;
  Logger.log('Done. live=%s pending=%s duplicate=%s rejected=%s dead=%s', count('live'), count('pending'), count('duplicate'), count('rejected'), count('dead'));
}

/** Run once after migrateV2(). Removes ALL old triggers (including the IMPORTXML batch ones) and adds the new ones. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('repairPending').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('recheckLive').timeBased().everyHours(6).create();
  if (CONFIG.BUMP_RANDOM_DAILY) ScriptApp.newTrigger('bumpRandom').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Triggers installed: %s', ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(', '));
}

/* ------------------------------------------------------------------ helpers */

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET);
}

function readRows(sheet) {
  sheet = sheet || getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues().map((v, i) => {
    const p = parseLink(String(v[0]));
    return {
      row: i + 2, code: p ? p.code : '', link: p ? p.link : String(v[0]),
      time: v[COL.TIME - 1], name: String(v[COL.NAME - 1] || ''), image: String(v[COL.IMAGE - 1] || ''),
      cat: String(v[COL.CAT - 1] || ''), desc: String(v[COL.DESC - 1] || ''), status: String(v[COL.STATUS - 1] || ''),
      checks: v[COL.CHECKS - 1], checked: v[COL.CHECKED - 1], reports: v[COL.REPORTS - 1],
      topic: String(v[COL.TOPIC - 1] || '')
    };
  });
}

function parseLink(v) {
  v = String(v || '').trim().split(/[?#\s]/)[0].replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
  if (v && !/^https:\/\//i.test(v)) v = 'https://' + v;
  const m = LINK_RE.exec(v);
  if (!m) return null;
  return m[1] ? { code: m[1], link: 'https://chat.whatsapp.com/' + m[1], channel: false }
              : { code: m[2], link: 'https://whatsapp.com/channel/' + m[2], channel: true };
}

const FETCH_OPTS = { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShareYourGroupBot/2.0; +https://www.shareyourgroup.com)', 'Accept-Language': 'en' } };

function fetchMeta(url) {
  try { return parseMeta(UrlFetchApp.fetch(url, FETCH_OPTS)); } catch (e) { return { name: '', image: '' }; }
}

function fetchMetaMany(urls) {
  try {
    return UrlFetchApp.fetchAll(urls.map(u => Object.assign({ url: u }, FETCH_OPTS))).map(parseMeta);
  } catch (e) {
    return urls.map(fetchMeta);
  }
}

function parseMeta(res) {
  if (!res || res.getResponseCode() !== 200) return { name: '', image: '' };
  const html = res.getContentText('UTF-8');
  const name = clean(metaContent(html, 'og:title'));
  const image = metaContent(html, 'og:image');
  return {
    name: GENERIC_NAME.test(name) ? '' : name,
    image: /^https:\/\/pps\.whatsapp\.net\//.test(image) ? image : ''
  };
}

function metaContent(html, prop) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (let i = 0; i < tags.length; i++) {
    const p = /\bproperty\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tags[i]);
    if (!p || (p[1] || p[2]) !== prop) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tags[i]);
    return c ? decodeEntities(c[1] != null ? c[1] : c[2]) : '';
  }
  return '';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function clean(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function isBlocked(text) {
  return BLOCKED_RE.test(String(text || '').normalize('NFKC'));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
