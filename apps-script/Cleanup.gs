/**
 * Designed & Developed by Nivesh Sahayak (https://www.niveshsahayak.in/). All rights reserved: see LICENSE.
 *
 * One-off clean-up for blog posts that had a whole web page pasted into them.
 * Removes only the page-head tags inside each post body: <!DOCTYPE>, <html>, <head>, <title>…</title>,
 * <meta …> and <body> (and their closing tags). Blogger already writes the real title and description,
 * so these were duplicates. Scripts, styles, links and the post text are left exactly as they are.
 *
 * Setup: Apps Script editor → Services (+) → "Blogger API" (v3, identifier "Blogger") → Add.
 * 1. cleanupPreview()  Changes nothing. Logs how many posts would change and one before/after example.
 * 2. cleanupRun()      Saves a backup of every post it changes to Google Drive, then fixes the posts,
 *                      about 40 per run, and starts itself again every minute until all are done.
 * 3. cleanupRestore()  Only if something looks wrong: puts every backed-up post back as it was.
 */
const CLEAN = {
  BLOG_URL: 'https://www.your-domain.com/',   // EDIT: your blog's address
  PER_RUN: 40,                                // posts changed per run (keeps each run under Apps Script's time limit)
  BACKUP_PREFIX: 'Blog post backup '          // Drive file name prefix for the backups
};

/** The clean-up itself: returns the post HTML without page-head tags. */
function cleanBody_(html) {
  const before = String(html || '');
  const after = before
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '');
  if (after === before) return before;                        // nothing to remove: leave the post untouched
  return after.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');    // collapse the blank lines left behind
}

function blogId_() {
  return Blogger.Blogs.getByUrl(CLEAN.BLOG_URL).id;
}

/** Every live post, one page at a time: fn(post) for each. Return true from fn to stop early. */
function eachPost_(blogId, pageToken, fn) {
  let token = pageToken || null;
  do {
    const res = Blogger.Posts.list(blogId, { maxResults: 20, fetchBodies: true, status: 'LIVE', pageToken: token });
    const items = res.items || [];
    for (let i = 0; i < items.length; i++) if (fn(items[i], token)) return { stopped: true };
    token = res.nextPageToken || null;
  } while (token);
  return { stopped: false };
}

/** Step 1: shows what would change. Changes nothing. */
function cleanupPreview() {
  const id = blogId_();
  let total = 0, changed = 0, example = null;
  eachPost_(id, null, function (p) {
    total++;
    const after = cleanBody_(p.content);
    if (after !== p.content) {
      changed++;
      if (!example) example = p;
    }
  });
  Logger.log('%s live posts, %s would be cleaned.', total, changed);
  if (example) {
    const removed = (example.content.match(/<!DOCTYPE[^>]*>|<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>|<\/?(?:html|head|body)\b[^>]*>/gi) || []);
    Logger.log('Example: %s\nTags that would be removed:\n%s', example.url, removed.map(function (s) { return '  ' + s.slice(0, 160); }).join('\n'));
    Logger.log('Size before %s characters, after %s.', example.content.length, cleanBody_(example.content).length);
  }
}

/** Step 2: backs up and cleans the posts, a batch per run, re-scheduling itself until finished. */
function cleanupRun() {
  const props = PropertiesService.getScriptProperties();
  const started = Date.now();
  const id = blogId_();
  const backup = [];
  let fixed = 0;
  const res = eachPost_(id, props.getProperty('CLEAN_TOKEN'), function (p, token) {
    if (fixed >= CLEAN.PER_RUN || Date.now() - started > 4.5 * 60 * 1000) return true;   // stop; this page is re-read next run
    const after = cleanBody_(p.content);
    if (after === p.content) return false;
    backup.push({ id: p.id, url: p.url, title: p.title, content: p.content });
    saveBackup_(backup);                                                                 // backup before changing
    Blogger.Posts.patch({ content: after }, id, p.id);
    fixed++;
    props.setProperty('CLEAN_TOKEN', token || '');
    return false;
  });
  const done = Number(props.getProperty('CLEAN_DONE') || 0) + fixed;
  props.setProperty('CLEAN_DONE', String(done));
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cleanupRun') ScriptApp.deleteTrigger(t); });
  if (res.stopped) {
    ScriptApp.newTrigger('cleanupRun').timeBased().after(60 * 1000).create();
    Logger.log('Cleaned %s posts this run (%s in total). Continuing automatically in about a minute.', fixed, done);
  } else {
    props.deleteProperty('CLEAN_TOKEN');
    Logger.log('All done: %s posts cleaned in total. Backups are in Google Drive ("%s…").', done, CLEAN.BACKUP_PREFIX);
  }
}

/** One Drive file per run, rewritten as posts are added, so a backup exists before each change. */
let backupFile_ = null;
function saveBackup_(posts) {
  const json = JSON.stringify(posts);
  if (!backupFile_) backupFile_ = DriveApp.createFile(CLEAN.BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') + '.json', json, 'application/json');
  else backupFile_.setContent(json);
}

/** Step 3 (only if needed): restores every post from the backup files, newest change last. */
function cleanupRestore() {
  const id = blogId_();
  const files = [], it = DriveApp.searchFiles('title contains "' + CLEAN.BACKUP_PREFIX + '"');
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });
  let n = 0;
  files.forEach(function (f) {
    JSON.parse(f.getBlob().getDataAsString()).forEach(function (p) { Blogger.Posts.patch({ content: p.content }, id, p.id); n++; });
  });
  Logger.log('Restored %s posts from %s backup files.', n, files.length);
}
