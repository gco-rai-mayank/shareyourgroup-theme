// Reads group names and photos from WhatsApp and sends them to the Apps Script.
// Why here and not in Apps Script: WhatsApp answers Google's servers with "429 Too Many Requests".
// Runs on GitHub Actions before build-data.mjs. Node 20+, no packages needed.
//
// Can also be run by hand to test the reader:  node scripts/enrich.mjs --test <invite link>

const API = process.env.APPS_SCRIPT_URL;
const TOKEN = process.env.ENRICH_TOKEN;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GENERIC = /^(error fetching name|fetching\.*|whatsapp group invite|whatsapp channel|whatsapp|\.+)?$/i;
const IMG = /^https:\/\/(?:pps|mmg)\.whatsapp\.net\//;

function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function clean(s) { return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function meta(html, prop) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const p = /\bproperty\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!p || (p[1] ?? p[2]) !== prop) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    return c ? decode(c[1] ?? c[2]) : '';
  }
  return '';
}

// Same rules as parseMeta() in apps-script/Code.gs
export function parse(html) {
  const invitePage = /property=["']og:site_name["'][^>]*WhatsApp/i.test(html) && /property=["']og:title["']/i.test(html);
  let name = clean(meta(html, 'og:title'));
  let image = meta(html, 'og:image');
  // backup only when the page has no og:title tag at all (an empty one means "dead link")
  if (!/property=["']og:title["']/i.test(html)) {
    const h = /<h3[^>]*class="[^"]*_9scr[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(html);
    if (h) name = clean(decode(h[1]));
  }
  if (!IMG.test(image)) {
    const im = /<img[^>]+src="(https:\/\/(?:pps|mmg)\.whatsapp\.net\/[^"]+)"/i.exec(html);
    if (im) image = decode(im[1]);
  }
  if (GENERIC.test(name)) name = '';
  return { name, image: IMG.test(image) ? image : '', dead: invitePage && !name };
}

async function read(link) {
  const res = await fetch(link, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) return { limited: true };
  if (!res.ok) return { name: '', image: '', dead: false };
  return parse(await res.text());
}

async function main() {
  if (process.argv[2] === '--test') {
    console.log(await read(process.argv[3]));
    return;
  }
  if (!API || !TOKEN) { console.log('ENRICH_TOKEN or APPS_SCRIPT_URL not set: skipping.'); return; }

  const todoRes = await fetch(`${API}?action=todo&token=${encodeURIComponent(TOKEN)}`, { redirect: 'follow', signal: AbortSignal.timeout(90_000) });
  const todo = await todoRes.json();
  if (!Array.isArray(todo)) { console.log('Apps Script said:', todo); return; }
  console.log(`${todo.length} links to read (${todo.filter(t => t.status === 'pending').length} new).`);

  const results = [];
  let limited = false;
  for (let i = 0; i < todo.length && !limited; i += 3) {          // 3 at a time, gently
    const batch = todo.slice(i, i + 3);
    const got = await Promise.all(batch.map(t => read(t.link).catch(() => ({ name: '', image: '', dead: false }))));
    got.forEach((g, k) => {
      if (g.limited) { limited = true; return; }
      if (g.name || g.dead) results.push({ link: batch[k].link, ...g });
    });
    await new Promise(r => setTimeout(r, 700));
  }
  if (limited) console.log('WhatsApp asked us to slow down; the rest will be read next run.');

  const named = results.filter(r => r.name).length, dead = results.filter(r => r.dead).length;
  console.log(`Read ${named} names, ${dead} links that look dead.`);
  if (!results.length) return;

  const post = await fetch(API, {
    method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ action: 'enrich', token: TOKEN, items: results })
  });
  console.log('Apps Script saved:', await post.text());
}

main().catch(e => { console.error(e); process.exitCode = 1; });
