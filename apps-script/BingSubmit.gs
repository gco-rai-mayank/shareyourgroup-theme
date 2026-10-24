/**
 * Designed & Developed by Nivesh Sahayak (https://www.niveshsahayak.in/). All rights reserved: see LICENSE.
 *
 * Daily Bing submission: sends blog posts published or updated since the last run to Bing's URL Submission API,
 * so Bing (and Yahoo, DuckDuckGo and Ecosia, which use Bing) pick them up fast. It does for Blogger what IndexNow
 * does elsewhere; IndexNow itself needs a key file at the site root, which Blogger can't host.
 *
 * Runs in its own Apps Script project (the one used for Cleanup.gs works), with the Blogger scope and
 * script.external_request + script.scriptapp in appsscript.json, and the Blogger API enabled in its Cloud project.
 * Setup:
 *   1. Bing Webmaster Tools → Settings → API access → API key. In this project: Project Settings →
 *      Script properties → add BING_API_KEY with that key.
 *   2. Run bingCheck()  : shows your daily quota and the posts the next run would send. Sends nothing.
 *   3. Run bingFirstPush() once: sends your homepage and newest posts, up to today's quota.
 *   4. Run bingSetup()  : installs the daily run (bingDaily, around 7 am).
 */
const BING = {
  SITE: 'https://www.your-domain.com',   // EDIT: exactly as the site is listed in Bing Webmaster Tools
  BLOG_URL: 'https://www.your-domain.com/'
};

function bingKey_() {
  const k = PropertiesService.getScriptProperties().getProperty('BING_API_KEY');
  if (!k) throw new Error('Add the Script property BING_API_KEY (Project Settings → Script properties).');
  return k.trim();
}

/** Bing Webmaster API call. */
function bingApi_(method, name, body) {
  const url = 'https://ssl.bing.com/webmaster/api.svc/json/' + name + (name.indexOf('?') > -1 ? '&' : '?') + 'apikey=' + encodeURIComponent(bingKey_());
  const res = UrlFetchApp.fetch(url, {
    method: method, contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
    payload: body ? JSON.stringify(body) : undefined
  });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) throw new Error('Bing ' + code + ': ' + text.slice(0, 400));
  return text ? JSON.parse(text) : {};
}

/** Blogger API call with your own sign-in (the blog's public feed is switched off). */
function bingBlogger_(path) {
  const res = UrlFetchApp.fetch('https://www.googleapis.com/blogger/v3/' + path, {
    muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  if (res.getResponseCode() >= 300) throw new Error('Blogger API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

/** Live posts newest-updated first, stopping at `since` (a Date) or `limit` posts. */
function bingRecentPosts_(since, limit) {
  const id = bingBlogger_('blogs/byurl?url=' + encodeURIComponent(BING.BLOG_URL)).id;
  const out = [];
  let token = null;
  do {
    const res = bingBlogger_('blogs/' + id + '/posts?maxResults=50&fetchBodies=false&status=live&orderBy=updated' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    const items = res.items || [];
    for (let i = 0; i < items.length; i++) {
      if (since && new Date(items[i].updated) <= since) return out;
      out.push({ url: items[i].url, updated: items[i].updated });
      if (out.length >= limit) return out;
    }
    token = res.nextPageToken || null;
  } while (token);
  return out;
}

function bingQuota_() {
  const d = bingApi_('get', 'GetUrlSubmissionQuota?siteUrl=' + encodeURIComponent(BING.SITE)).d || {};
  return { daily: Number(d.DailyQuota || 0), monthly: Number(d.MonthlyQuota || 0) };
}

function bingSend_(urls) {
  if (!urls.length) return 0;
  bingApi_('post', 'SubmitUrlbatch', { siteUrl: BING.SITE, urlList: urls });
  return urls.length;
}

function bingSince_() {
  const s = PropertiesService.getScriptProperties().getProperty('BING_LAST');
  return s ? new Date(s) : new Date(Date.now() - 24 * 3600 * 1000);
}

/** Step 2: shows the quota and what the next daily run would send. Sends nothing. */
function bingCheck() {
  const q = bingQuota_();
  const urls = bingRecentPosts_(bingSince_(), 500).map(function (p) { return p.url; });
  Logger.log('Bing quota left: %s today, %s this month.', q.daily, q.monthly);
  Logger.log('Posts published or updated since %s: %s', bingSince_().toISOString(), urls.length);
  urls.slice(0, 20).forEach(function (u) { Logger.log('  ' + u); });
}

/** Step 3 (once): homepage plus the newest posts, up to today's quota. */
function bingFirstPush() {
  const q = bingQuota_();
  const urls = [BING.BLOG_URL].concat(bingRecentPosts_(null, Math.max(0, q.daily - 1)).map(function (p) { return p.url; })).slice(0, q.daily);
  const n = bingSend_(urls);
  PropertiesService.getScriptProperties().setProperty('BING_LAST', new Date().toISOString());
  Logger.log('Sent %s URLs to Bing (quota was %s for today).', n, q.daily);
}

/** The daily run: posts published or updated since the last run, up to the quota. */
function bingDaily() {
  const props = PropertiesService.getScriptProperties(), started = new Date();
  const posts = bingRecentPosts_(bingSince_(), 500).reverse();   // oldest first, so a short quota resumes in order
  if (!posts.length) { Logger.log('Nothing new since %s.', bingSince_().toISOString()); props.setProperty('BING_LAST', started.toISOString()); return; }
  const q = bingQuota_();
  const send = posts.slice(0, q.daily);
  bingSend_(send.map(function (p) { return p.url; }));
  // all sent: next run starts from now. Quota ran out: next run starts after the last post that was sent.
  props.setProperty('BING_LAST', send.length < posts.length ? send[send.length - 1].updated : started.toISOString());
  Logger.log('Sent %s of %s new/updated posts to Bing.%s', send.length, posts.length, send.length < posts.length ? ' The rest go tomorrow.' : '');
}

/** Step 4: installs the daily run (and removes an older copy of it). */
function bingSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'bingDaily') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('bingDaily').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Daily Bing submission installed (around 7 am, %s).', Session.getScriptTimeZone());
}
