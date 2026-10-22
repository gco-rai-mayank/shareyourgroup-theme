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
  const p = (e && e.parameter) || {};
  if (p.action === 'todo') return json(okToken(p.token) ? todoRows() : { ok: false, message: 'bad token' });
  const since = Date.parse(p.since);
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
    // only live rows with a real name (old rows can be "live" with an empty name; the GitHub reader fills those in)
    if ((r.status && r.status !== 'live') || GENERIC_NAME.test(clean(r.name))) return;
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
  if (data.action === 'enrich') return json(okToken(data.token) ? enrich(data.items) : { ok: false, message: 'bad token' });
  return json(submit(data));
}

/* ------------------------------------------------------------------ GitHub helper
   WhatsApp answers Google's servers with "429 Too Many Requests" (all Apps Script projects share them),
   so the GitHub job reads the group details instead:
     GET  ?action=todo&token=…           → links that need a name/photo, plus the least recently checked live ones
     POST {action:'enrich', token, items} → saves what GitHub found
   The token stops strangers from writing to the sheet. Create it once with setupGitHubHelper(). */

/* GitHub's own 15-minute schedule often doesn't run for this repo, so Apps Script starts the job:
   every 15 minutes (trigger made by setup) and about a minute after someone submits a group.
   Needs a GitHub access key saved under Project Settings → Script properties → GITHUB_TOKEN
   (fine-grained token, only this repo, permission "Actions: Read and write"). */
const GH_REPO = 'gco-rai-mayank/shareyourgroup-theme';
const GH_WORKFLOW = 'sync-groups.yml';

function kickGitHub() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { Logger.log('No GITHUB_TOKEN in Script properties yet.'); return false; }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GH_REPO + '/actions/workflows/' + GH_WORKFLOW + '/dispatches', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token.trim(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main' })
  });
  const ok = res.getResponseCode() === 204;
  Logger.log(ok ? 'GitHub job started.' : 'GitHub said ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return ok;
}

/** After a submission: start the job, at most once every 3 minutes. */
function kickSoon() {
  const cache = CacheService.getScriptCache();
  if (cache.get('kicked')) return;
  cache.put('kicked', '1', 180);
  try { kickGitHub(); } catch (e) {}
}

function setupGitHubHelper() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('ENRICH_TOKEN');
  if (!t) { t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('ENRICH_TOKEN', t); }
  Logger.log('Copy this into GitHub → Settings → Secrets → Actions → New secret named ENRICH_TOKEN:');
  Logger.log(t);
}

function okToken(t) {
  const real = PropertiesService.getScriptProperties().getProperty('ENRICH_TOKEN');
  return !!real && t === real;
}

function todoRows() {
  const rows = readRows();
  const byChecked = (a, b) => (new Date(a.checked || 0)) - (new Date(b.checked || 0));
  const noName = r => GENERIC_NAME.test(clean(r.name));
  // 1) newest submissions first, so new groups show up fast  2) other rows without a name  3) oldest-checked live rows
  const byNewest = (a, b) => (new Date(b.time || 0)) - (new Date(a.time || 0));
  const fresh = rows.filter(r => r.code && (r.status === 'pending' || (r.status === 'live' && noName(r)))).sort(byNewest);
  const first = fresh.slice(0, 10), rest = fresh.slice(10).sort(byChecked).slice(0, 30);
  const live = rows.filter(r => r.code && r.status === 'live' && !noName(r)).sort(byChecked).slice(0, 50 - first.length - rest.length);
  return first.concat(rest, live).map(r => ({ link: r.link, status: noName(r) ? 'pending' : r.status }));
}

function enrich(items) {
  if (!Array.isArray(items) || !items.length) return { ok: true, updated: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'busy' };
  let updated = 0, nowLive = 0;
  try {
    const sheet = getSheet();
    const byCode = {};
    readRows(sheet).forEach(r => { if (r.code) byCode[r.code] = r; });
    const now = new Date();
    items.forEach(it => {
      const p = parseLink(it && it.link);
      const r = p && byCode[p.code];
      if (!r) return;
      const name = clean(it.name).slice(0, 120);
      const image = /^https:\/\/(?:pps|mmg)\.whatsapp\.net\//.test(it.image || '') ? String(it.image) : '';
      if (name && !GENERIC_NAME.test(name)) {
        let status = r.status;
        if (status === 'pending' || status === '') status = isBlocked(name + ' ' + r.desc) ? 'rejected' : 'live';
        if (status === 'live' && r.status !== 'live') nowLive++;
        sheet.getRange(r.row, COL.NAME, 1, 2).setValues([[name, image || r.image]]);
        sheet.getRange(r.row, COL.STATUS, 1, 3).setValues([[status, 0, now]]);
        updated++;
      } else if (it.dead === true) {
        const checks = (Number(r.checks) || 0) + 1;
        sheet.getRange(r.row, COL.STATUS, 1, 3).setValues([[checks >= CONFIG.MAX_CHECKS ? 'dead' : r.status, checks, now]]);
        updated++;
      }
    });
    if (nowLive || updated) CacheService.getScriptCache().put('gen', String(Date.now()), 21600);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, updated: updated, nowLive: nowLive };
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
    if (meta.dead) {
      return { ok: false, status: 'dead', message: 'WhatsApp says this invite link doesn’t work. It may have been reset. Copy a fresh link from the group and try again.' };
    }
    let status = meta.name ? 'live' : 'pending';
    if (isBlocked(meta.name + ' ' + desc)) status = 'rejected';

    const values = [parsed.link, now, meta.name, meta.image, cat, desc, status, 0, now, 0, now, addTopic(existing && existing.topic, topic)];
    if (existing) sheet.getRange(existing.row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    if (status === 'live') CacheService.getScriptCache().put('gen', String(Date.now()), 21600);

    if (status === 'rejected') return { ok: true, status, message: 'This group can’t be listed because it breaks our rules.' };
    if (status === 'pending') kickSoon();   // GitHub reads the name and photo in about a minute
    if (status === 'pending') return { ok: true, status, message: 'Got it! We’re fetching your group’s name and photo from WhatsApp. It will appear on the site in a few minutes.' };
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
      } else if (m.dead) {
        // WhatsApp clearly said the link doesn't work: count it, and mark dead after a few clear answers
        const checks = (Number(r.checks) || 0) + 1;
        sheet.getRange(r.row, COL.STATUS, 1, 3).setValues([[checks >= CONFIG.MAX_CHECKS ? 'dead' : r.status, checks, now]]);
      } else {
        // no clear answer (blocked or error): don't count it against the group, just try again later
        sheet.getRange(r.row, COL.CHECKED).setValue(now);
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
    if (!/^https:\/\/(?:pps|mmg)\.whatsapp\.net\//.test(image)) image = '';
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
  // WhatsApp blocks Google's servers (429), so these two rarely succeed now; GitHub does the reading.
  // Kept as a backup, less often, so they don't waste time.
  ScriptApp.newTrigger('repairPending').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('recheckLive').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('kickGitHub').timeBased().everyMinutes(15).create();
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

const PLAIN_OPTS = { muteHttpExceptions: true, followRedirects: true };

/**
 * Result of reading an invite page:
 *   { name, image, dead }  dead = true only when WhatsApp clearly says the link doesn't work
 *   (a real invite page with an empty name). A blocked or broken answer is "unknown": no name, dead = false,
 *   so a good group is never marked dead just because Google's servers were refused.
 */
/** Tries the link a few ways (WhatsApp sometimes answers Google's servers differently) until it gets a clear answer. */
function fetchMeta(url) {
  const tries = [[url, FETCH_OPTS], [url, PLAIN_OPTS]];
  const code = (/([A-Za-z0-9]{15,40})$/.exec(url) || [])[1];
  if (code && url.indexOf('chat.whatsapp.com') > -1) tries.push(['https://chat.whatsapp.com/invite/' + code, PLAIN_OPTS]);
  let best = { name: '', image: '', dead: false };
  for (let i = 0; i < tries.length; i++) {
    try {
      const m = parseMeta(UrlFetchApp.fetch(tries[i][0], tries[i][1]));
      if (m.name) return m;
      if (m.dead) best = m;            // keep trying the other ways before believing it
    } catch (e) {}
  }
  return best;
}

function fetchMetaMany(urls) {
  let metas;
  try {
    metas = UrlFetchApp.fetchAll(urls.map(u => Object.assign({ url: u }, FETCH_OPTS))).map(parseMeta);
  } catch (e) {
    metas = urls.map(() => ({ name: '', image: '', dead: false }));
  }
  return metas.map((m, i) => m.name ? m : fetchMeta(urls[i]));   // second chance for the misses
}

function parseMeta(res) {
  if (!res || res.getResponseCode() !== 200) return { name: '', image: '', dead: false };
  const html = res.getContentText('UTF-8');
  const isInvitePage = /property=["']og:site_name["'][^>]*WhatsApp/i.test(html) && /property=["']og:title["']/i.test(html);
  let name = clean(metaContent(html, 'og:title'));
  let image = metaContent(html, 'og:image');
  // backup: the invite page also shows the name in a heading and the photo in an <img>
  // backup only when the page has no og:title tag at all (an empty one means "dead link")
  if (!/property=["']og:title["']/i.test(html)) {
    const h = /<h3[^>]*class="[^"]*_9scr[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(html);
    if (h) name = clean(decodeEntities(h[1]));
  }
  if (!/^https:\/\/(?:pps|mmg)\.whatsapp\.net\//.test(image)) {
    const im = /<img[^>]+src="(https:\/\/(?:pps|mmg)\.whatsapp\.net\/[^"]+)"/i.exec(html);
    if (im) image = decodeEntities(im[1]);
  }
  name = GENERIC_NAME.test(name) ? '' : name;
  return {
    name: name,
    image: /^https:\/\/(?:pps|mmg)\.whatsapp\.net\//.test(image) ? image : '',
    dead: isInvitePage && !name
  };
}

/**
 * TEST: run this from the editor (choose testFetch → Run, then open "Execution log").
 * It shows exactly what WhatsApp sends to Google's servers for one link.
 */
function testFetch() {
  const url = 'https://chat.whatsapp.com/HvHAYELY14WAx5ECyY41MV';
  [['with our browser name', FETCH_OPTS], ['plain', PLAIN_OPTS]].forEach(t => {
    try {
      const res = UrlFetchApp.fetch(url, t[1]);
      const html = res.getContentText('UTF-8');
      Logger.log('[%s] status=%s size=%s og:title=%s og:image=%s <title>=%s', t[0], res.getResponseCode(), html.length,
        metaContent(html, 'og:title') || '(none)', metaContent(html, 'og:image') ? 'yes' : 'no', ((/<title[^>]*>([^<]*)/i.exec(html) || [])[1] || '').trim());
      Logger.log('[%s] page starts: %s', t[0], html.slice(0, 400).replace(/\s+/g, ' '));
    } catch (e) {
      Logger.log('[%s] ERROR: %s', t[0], e);
    }
  });
  Logger.log('Result the script would save: %s', JSON.stringify(fetchMeta(url)));
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
