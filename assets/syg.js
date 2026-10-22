/* ==========================================================
   ShareYourGroup theme — app script (no libraries needed)
   Settings come from window.SYG, set in the Blogger template.
   Designed & Developed by Nivesh Sahayak (https://www.niveshsahayak.in/).
   All rights reserved: use or redistribution needs written permission and visible credit. See LICENSE.
   ========================================================== */
(function () {
  'use strict';

  var d = document, root = d.documentElement, body = d.body;
  var C = Object.assign({
    dataUrl: '',          // fast cached list on GitHub Pages
    apiUrl: '',           // Google Apps Script web app (submit + fallback list)
    perPage: 24,
    adEvery: 6,           // a promo/ad card after every N groups (0 = off). The ad takes one card's space, so any number works.
    postAdEvery: 4,       // the same ad card after every N articles on the blog list (0 = off)
    disqus: '',           // Disqus shortname for comments on posts/pages
    livePoll: 90,         // seconds between checks for brand-new groups (0 = off)
    adClient: '',         // your AdSense publisher id (ca-pub-…), set in theme.xml
    adSlot: '',           // AdSense ad unit id for the card slots; empty = promo card only
    siteName: 'ShareYourGroup'
  }, window.SYG || {});
  if (!C.topicsUrl && /groups\.json/.test(C.dataUrl)) C.topicsUrl = C.dataUrl.replace(/groups\.json.*$/, 'topics/');

  /* ---------- helpers ---------- */
  function qs(s, c) { return (c || d).querySelector(s); }
  function qsa(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
  function fmt(n) { return Number(n).toLocaleString('en-IN'); }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function track(name, params) { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); }
  function ago(t) {
    if (!t) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  var ICON = {
    share: '<svg class="i" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    flag: '<svg class="i" viewBox="0 0 24 24"><path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/></svg>',
    arrow: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
  };

  var toastEl = qs('#toast');
  function toast(m) {
    if (!toastEl) return;
    toastEl.textContent = m; toastEl.classList.add('show');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- categories (ids must match the Apps Script list) ---------- */
  var CATS = [
    ['education', 'Education & Exams', '📚', 'study|studies|exam|exams|student|students|neet|jee|upsc|ssc|tnpsc|mpsc|bpsc|rpsc|board|class|school|college|coaching|ias|gk|quiz|english|learning|notes|course|teacher|tuition|result|results|cbse|university'],
    ['jobs', 'Jobs & Careers', '💼', 'job|jobs|hiring|vacancy|vacancies|career|careers|recruitment|naukri|placement|internship|resume'],
    ['stocks', 'Stocks & Crypto', '📈', 'stock|stocks|trading|trader|treding|share market|sharemarket|nifty|sensex|banknifty|options|forex|crypto|bitcoin|invest|investment|investing|mutual fund|sip|ipo'],
    ['earning', 'Online Earning', '💸', 'earn|earning|earnings|paytm|income|money|reward|rewards|refer|referral|side hustle|work from home'],
    ['business', 'Business & Marketing', '🚀', 'business|marketing|digital|network|networking|entrepreneur|startup|sales|reseller|wholesale|dropshipping|affiliate|brand|promotion|sub4sub'],
    ['shopping', 'Shopping & Deals', '🛍️', 'shopping|shop|deal|deals|offer|offers|loot|discount|sale|amazon|flipkart|meesho|buy|sell|seller|selling|property|real estate|rent'],
    ['tech', 'Tech & AI', '💻', 'tech|technology|coding|programming|developer|ai|chatgpt|android|app|apps|software|computer|cyber|python|java|design|editing|editor'],
    ['gaming', 'Gaming', '🎮', 'game|games|gaming|gamer|gamers|free fire|freefire|bgmi|pubg|cod|minecraft|esports|ludo|clash'],
    ['entertainment', 'Movies & Shows', '🎬', 'movie|movies|film|films|series|netflix|anime|drama|kdrama|cinema|bollywood|hollywood|tollywood|youtuber|youtube|reels|instagram'],
    ['music', 'Music', '🎧', 'music|song|songs|dj|rap|singer|singing|lofi'],
    ['fun', 'Memes & Fun', '😂', 'meme|memes|funny|fun|comedy|joke|jokes|masti|timepass|vibes|vibe'],
    ['friendship', 'Friends & Chat', '🤝', 'friend|friends|friendship|chat|chatting|dosti|yaari|family|connect|community|gossip|talk'],
    ['love', 'Love & Dating', '💖', 'love|relationship|relationships|romance|romantic|dating|couple|couples|crush'],
    ['quotes', 'Shayari & Quotes', '✍️', 'shayari|quote|quotes|poetry|poem|motivation|motivational|thought|thoughts|attitude'],
    ['news', 'News & Updates', '📰', 'news|update|updates|alert|alerts|khabar|samachar|breaking|current affairs'],
    ['sports', 'Sports & Fitness', '🏏', 'cricket|football|sport|sports|fitness|gym|yoga|ipl|kabaddi|workout'],
    ['religion', 'Faith & Spiritual', '🙏', 'god|bhakti|islam|islamic|quran|jesus|christian|church|bible|hindu|sikh|gurbani|waheguru|temple|krishna|shiv|shiva|mahadev|spiritual|dua|allah|sanatan'],
    ['travel', 'Travel & Abroad', '✈️', 'travel|tour|tours|trip|tourism|abroad|visa|gulf|dubai|canada|europe|immigration'],
    ['health', 'Health & Beauty', '🩺', 'health|doctor|medical|medicine|beauty|skincare|makeup|diet|ayurveda|wellness|nurse|nursing'],
    ['food', 'Food & Cooking', '🍲', 'food|recipe|recipes|cooking|kitchen|foodie|bakery|cake'],
    ['others', 'Others', '✨', '']
  ].map(function (c) {
    return { id: c[0], label: c[1], e: c[2], re: c[3] ? new RegExp('(?:^|[^\\p{L}\\p{N}])(?:' + c[3] + ')(?=$|[^\\p{L}\\p{N}])', 'iu') : null };
  });
  var CAT = {}; CATS.forEach(function (c) { CAT[c.id] = c; });
  function classify(text) {
    var t = norm(text);
    for (var i = 0; i < CATS.length; i++) if (CATS[i].re && CATS[i].re.test(t)) return CATS[i].id;
    return 'others';
  }
  /* category links in the Groups menu (counts appear once the list has loaded) */
  function renderCatsMenu(counts) {
    var list = CATS.slice();
    if (counts) list.sort(function (a, b) { return (a.id === 'others') - (b.id === 'others') || (counts[b.id] || 0) - (counts[a.id] || 0); });
    var html = list.map(function (c) {
      return '<a data-chip="' + c.id + '" href="/?cat=' + c.id + '#explore"><span aria-hidden="true">' + c.e + '</span>' + esc(c.label) +
        (counts && counts[c.id] ? '<em>' + fmt(counts[c.id]) + '</em>' : '') + '</a>';
    }).join('');
    qsa('[data-cats-menu]').forEach(function (m) { m.innerHTML = html; });
  }
  renderCatsMenu();

  /* FAQ: topic tabs, a search box, a link for every question (#faq-…), and the FAQPage structured data */
  (function faq() {
    var box = qs('[data-faq-schema]');
    if (!box) return;
    var tab = 'all', input = qs('[data-faq-search]'), empty = qs('.faq-empty', box);
    function slug(s) { return 'faq-' + s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }
    qsa('details', box).forEach(function (dt) { if (!dt.id) dt.id = slug(qs('summary', dt).textContent); });
    function show() {
      var words = (input && input.value || '').toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
      qsa('details', box).forEach(function (dt) {
        var text = dt.textContent.toLowerCase();
        var ok = (tab === 'all' || dt.getAttribute('data-faq') === tab) && words.every(function (w) { return text.indexOf(w) > -1; });
        dt.hidden = !ok; if (ok) shown++;
        if (ok && words.length) dt.open = true;
      });
      qsa('.faq-group', box).forEach(function (h) {   // hide a heading when none of its questions are showing
        var n = h.nextElementSibling, any = false;
        while (n && n.tagName === 'DETAILS') { if (!n.hidden) any = true; n = n.nextElementSibling; }
        h.hidden = !any;
      });
      if (empty) empty.hidden = shown > 0;
    }
    qsa('[data-faq-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        tab = b.getAttribute('data-faq-tab');
        qsa('[data-faq-tab]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        show();
      });
    });
    if (input) input.addEventListener('input', show);
    function openHash() {   // /#faq-how-do-i-join-… opens and shows that one question
      var dt = location.hash.length > 5 && qs('details' + location.hash.replace(/[^#\w-]/g, ''), box);
      if (dt) { dt.open = true; setTimeout(function () { dt.scrollIntoView({ block: 'center' }); }, 300); }
    }
    openHash(); window.addEventListener('hashchange', openHash);
    var items = qsa('details', box).map(function (dt) {
      var q = qs('summary', dt), a = qs('div', dt);
      return { '@type': 'Question', name: q.textContent.trim(), acceptedAnswer: { '@type': 'Answer', text: a.innerHTML.replace(/\s+/g, ' ').trim() } };
    });
    var s = d.createElement('script'); s.type = 'application/ld+json';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items });
    d.head.appendChild(s);
  })();

  /* ---------- group data ---------- */
  var CODE_RE = /(?:chat\.whatsapp\.com\/(?:invite\/)?|whatsapp\.com\/(channel)\/)([A-Za-z0-9]{15,40})/;
  var LINK_RE = /^https:\/\/(?:chat\.whatsapp\.com\/(?:invite\/)?[A-Za-z0-9]{15,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{15,40})$/;
  var BAD_NAME = /^(error fetching name|fetching\.*|whatsapp group invite|whatsapp channel|whatsapp|\.+)$/i;
  var decoder = d.createElement('textarea');
  function decode(s) { decoder.innerHTML = String(s || ''); return decoder.value.trim(); }

  var REG = {};              // every group seen on this page, by id (for share / report buttons)
  function toGroup(r) {
    var g;
    if (r.l) {               // compact format from data/groups.json
      g = { id: r.id, name: r.n, link: r.l, img: r.i || '', t: r.t || 0, cat: r.c || '', desc: r.d || '', ch: !!r.ch, p: r.p || '' };
    } else {                 // raw Apps Script format (fallback + live updates)
      var link = String(r.group_link || '').split('?')[0], m = CODE_RE.exec(link), name = decode(r.group_name);
      if (!m || !name || BAD_NAME.test(name)) return null;
      var img = /^https:\/\/(?:pps|mmg)\.whatsapp\.net\//.test(r.group_image || '') ? r.group_image : '';
      g = { id: m[2], name: name, link: link, img: img, t: Date.parse(r.timestamp) || 0, cat: r.category || '', desc: decode(r.description), ch: m[1] === 'channel', p: r.topic || '' };
    }
    if (!CAT[g.cat]) g.cat = classify(g.name + ' ' + g.desc);
    g.s = norm(g.name + ' ' + g.desc + ' ' + CAT[g.cat].label);
    REG[g.id] = g;
    return g;
  }
  function inTopic(g, topic) { return (',' + g.p + ',').indexOf(',' + topic + ',') > -1; }
  /* blog-post lists are identified by part of their old Apps Script ID (same rule as apps-script/Topics.gs) */
  function topicIdOf(url) { var m = /macros\/s\/([A-Za-z0-9_-]+)\/exec/.exec(url || ''); return m ? m[1].slice(6, 18) : ''; }

  /* ---------- data loading ---------- */
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function bust(u) { return /^https?:/.test(u) ? u + (u.indexOf('?') > -1 ? '&' : '?') + 'v=' + Math.floor(Date.now() / 6e5) : u; }
  function listOf(j) { return Array.isArray(j) ? j : (j && j.groups) || []; }
  /* groups added or bumped since the GitHub copy was made — straight from the Apps Script, so new submissions show for everyone at once */
  function recent(since) {
    if (!C.apiUrl || !since) return Promise.resolve([]);
    return getJSON(C.apiUrl + (C.apiUrl.indexOf('?') > -1 ? '&' : '?') + 'since=' + encodeURIComponent(since)).then(listOf).catch(function () { return []; });
  }
  /* merge raw rows into a list; returns how many were new */
  function merge(list, raw, keep) {
    var ids = {}, added = 0;
    list.forEach(function (g) { ids[g.id] = g; });
    raw.forEach(function (r) {
      var g = toGroup(r);
      if (!g || (keep && !keep(g))) return;
      if (ids[g.id]) { if (g.t > ids[g.id].t) ids[g.id].t = g.t; return; }
      list.unshift(g); ids[g.id] = g; added++;
    });
    return added;
  }
  var newListeners = [];     // widgets that want to show a group the visitor just submitted
  function normaliseLink(v) {
    v = String(v || '').trim().split(/[?#\s]/)[0].replace(/^http:\/\//i, 'https://');
    if (v && !/^https:\/\//i.test(v)) v = 'https://' + v;
    return v.replace(/\/+$/, '');
  }

  /* ---------- page basics: theme, menu, header, back-to-top ---------- */
  var tt = qs('#themeToggle');
  if (tt) tt.addEventListener('click', function () {
    var n = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', n); store('syg-theme', n);
  });
  var mt = qs('#menuToggle');
  function setNav(open) { body.classList.toggle('nav-open', open); if (mt) mt.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (mt) mt.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')); });
  qsa('.nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
  d.addEventListener('click', function (e) {
    qsa('.nav-drop[open]').forEach(function (x) { if (!x.contains(e.target) || e.target.closest('.mega a')) x.removeAttribute('open'); });
  });
  /* only one menu open at a time */
  qsa('.nav-drop').forEach(function (dd) {
    dd.addEventListener('toggle', function () { if (dd.open) qsa('.nav-drop[open]').forEach(function (x) { if (x !== dd) x.removeAttribute('open'); }); });
  });
  var here = location.pathname.replace(/\/+$/, '') || '/';
  qsa('.nav-link, .tabbar a').forEach(function (a) {
    if ((a.getAttribute('href') || '').indexOf('#') > -1) return;   // in-page jumps are never "the current page"
    try { if ((new URL(a.href, location.href).pathname.replace(/\/+$/, '') || '/') === here) { a.classList.add('active', 'is-on'); a.setAttribute('aria-current', 'page'); } } catch (e) {}
  });
  var hdr = qs('.site-header'), toTop = qs('#toTop'), ticking = false;
  function onScroll() {
    var y = window.pageYOffset;
    if (hdr) hdr.classList.toggle('scrolled', y > 8);
    if (toTop) toTop.classList.toggle('show', y > 900);
    ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  qsa('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });
  qsa('[data-dismiss]').forEach(function (b) {
    var box = b.closest('[data-dismissable]'), key = 'syg-hide-' + (box && box.id);
    if (!box) return;
    if (store(key)) { box.hidden = true; return; }
    b.addEventListener('click', function () { box.hidden = true; store(key, 1); });
  });

  /* ---------- dialog ---------- */
  var dlg;
  function openDialog(title, html, onMount) {
    if (!dlg) {
      dlg = d.createElement('dialog'); dlg.className = 'sheet'; dlg.id = 'sygDialog';
      body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    }
    dlg.innerHTML = '<div class="sheet-head"><h3>' + esc(title) + '</h3><button aria-label="Close" class="icon-btn" data-close="1" type="button">' + ICON.x + '</button></div><div class="sheet-body">' + html + '</div>';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (onMount) onMount(qs('.sheet-body', dlg));
  }
  function closeDialog() { if (dlg && dlg.open) dlg.close(); }

  /* ---------- explorer state ---------- */
  var app = qs('#syg-app');
  var S = { all: [], view: [], shown: 0, q: '', cat: 'all', type: 'all', sort: 'new', seed: Math.random(), auto: store('syg-autoscroll') !== false };
  var grid, chipsEl, resultEl, resetBtn, searchIn, io;

  (function readURL() {
    var p = new URLSearchParams(location.search);
    S.q = p.get('q') || ''; S.cat = CAT[p.get('cat')] ? p.get('cat') : 'all';
    S.type = /^(groups|channels)$/.test(p.get('type')) ? p.get('type') : 'all';
    S.sort = /^(az|mix)$/.test(p.get('sort')) ? p.get('sort') : 'new';
  })();
  function writeURL() {
    if (!app) return;
    var p = new URLSearchParams(location.search);
    [['q', S.q, ''], ['cat', S.cat, 'all'], ['type', S.type, 'all'], ['sort', S.sort, 'new']].forEach(function (x) { if (x[1] && x[1] !== x[2]) p.set(x[0], x[1]); else p.delete(x[0]); });
    p.delete('g');
    var s = p.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  }

  function avatar(g) {
    var letters = Array.from(g.name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(function (w) { return Array.from(w)[0] || ''; }).join('')).join('').toUpperCase() || '#';
    return '<span class="g-ava" style="--h:' + hue(g.id) + '" aria-hidden="true">' + esc(letters) +
      (g.img ? '<img alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer" src="' + esc(g.img) + '"/>' : '') + '</span>';
  }
  function card(g) {
    var c = CAT[g.cat], fresh = Date.now() - g.t < 6 * 3600 * 1000;
    return '<article class="g-card' + (g.hl ? ' is-hl' : '') + '" data-id="' + esc(g.id) + '">' +
      (fresh ? '<span class="g-new">NEW</span>' : '') +
      '<div class="g-top">' + avatar(g) + '<div class="g-meta"><h3 class="g-name">' + esc(g.name) + '</h3>' +
      '<div class="g-sub">' + (g.ch ? '<span class="g-tag">CHANNEL</span>' : '') +
      '<span class="g-cat" data-cat="' + c.id + '" role="button" tabindex="0">' + c.e + ' ' + esc(c.label) + '</span>' +
      (g.t ? '<span aria-hidden="true">·</span><time>' + ago(g.t) + '</time>' : '') + '</div></div></div>' +
      (g.desc ? '<p class="g-desc">' + esc(g.desc) + '</p>' : '') +
      '<div class="g-actions"><a class="btn btn-primary" ' + joinAttrs(g) + '>Join ' + (g.ch ? 'channel' : 'group') + ' ' + ICON.arrow + '</a>' +
      '<button aria-expanded="false" aria-label="Share" class="icon-btn" data-share="' + esc(g.id) + '" type="button">' + ICON.share + '</button>' +
      '<button aria-label="Report" class="icon-btn" data-report="' + esc(g.id) + '" type="button">' + ICON.flag + '</button></div></article>';
  }
  function skeleton(n) {
    var one = '<div class="g-card sk"><div class="g-top"><span class="g-ava"></span><div class="g-meta"><div class="sk-line" style="width:80%"></div><div class="sk-line" style="width:45%"></div></div></div><div class="sk-line" style="height:40px;border-radius:12px"></div></div>';
    return new Array(n + 1).join(one);
  }
  /* The promo/ad HTML comes from the hidden Blogger gadget. Read it once, then remove the gadget so its
     copy of the ad never loads inside a hidden box (that gives AdSense a 0-width slot and an error). */
  var promoHtml = (function () {
    var src = qs('.promo-src'), p = src && (qs('.widget-content', src) || src), html = p ? p.innerHTML.trim() : '';
    if (src) src.parentNode.removeChild(src);
    // "full width responsive" would stretch the ad past its card on phones
    return html.replace(/\sdata-full-width-responsive=(["'])true\1/gi, ' data-full-width-responsive="false"');
  })();
  /* Ad slots take turns: an AdSense ad (when SYG.adSlot is set), then the promo card, and so on. */
  var adTurn = 0;
  function adCard() {
    var useAdsense = C.adSlot && (adTurn % 2 === 0 || !promoHtml);
    adTurn++;
    if (useAdsense) {
      return '<div class="g-ad g-ad-adsense"><ins class="adsbygoogle" data-ad-client="' + esc(C.adClient) + '" data-ad-format="rectangle" data-ad-slot="' + esc(C.adSlot) + '" data-full-width-responsive="false" style="display:block"></ins></div>';
    }
    return promoHtml ? '<div class="g-ad">' + promoHtml + '</div>' : '';
  }

  function buildExplorer() {
    app.innerHTML =
      '<div class="toolbar"><div class="tb-row">' +
        '<label class="search">' + ICON.search + '<span class="sr-only">Search groups</span><input autocomplete="off" enterkeyhint="search" id="sygSearch" placeholder="Search groups, e.g. jobs, cricket, NEET…" type="search"/><kbd>/</kbd></label>' +
        '<div aria-label="Type" class="seg" role="group"><button data-type="all" type="button">All</button><button data-type="groups" type="button">Groups</button><button data-type="channels" type="button">Channels</button></div>' +
        '<label><span class="sr-only">Sort</span><select class="sort" id="sygSort"><option value="new">Newest</option><option value="az">A → Z</option><option value="mix">Shuffle</option></select></label>' +
      '</div><div aria-label="Categories" class="chips" role="toolbar"></div></div>' +
      '<div class="result-line"><span data-result="1">loading…</span><button data-reset="1" hidden="hidden" type="button">clear filters ×</button></div>' +
      '<div aria-live="polite" class="grid">' + skeleton(8) + '</div><div class="sentinel"></div>';
    grid = qs('.grid', app); chipsEl = qs('.chips', app); resultEl = qs('[data-result]', app); resetBtn = qs('[data-reset]', app);
    searchIn = qs('#sygSearch', app);
    searchIn.value = S.q;
    qs('#sygSort', app).value = S.sort;
    syncSeg();

    searchIn.addEventListener('input', debounce(function () { S.q = searchIn.value.trim(); apply(); }, 160));
    searchIn.addEventListener('keydown', function (e) { if (e.key === 'Escape') { searchIn.value = ''; S.q = ''; apply(); } });
    qs('#sygSort', app).addEventListener('change', function (e) { S.sort = e.target.value; S.seed = Math.random(); apply(); });
    qsa('[data-type]', app).forEach(function (b) { b.addEventListener('click', function () { S.type = b.getAttribute('data-type'); syncSeg(); apply(); }); });
    resetBtn.addEventListener('click', function () { S.q = ''; S.cat = 'all'; S.type = 'all'; searchIn.value = ''; syncSeg(); apply(); });
    grid.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

    if ('IntersectionObserver' in window) {
      // with auto-scroll on, groups keep loading as you scroll; off = a "Load more" button (so the footer is reachable)
      io = new IntersectionObserver(function (es) { sentinelNear = es[0].isIntersecting; if (sentinelNear && S.auto) more(); }, { rootMargin: '700px 0px' });
      io.observe(qs('.sentinel', app));
    }

    var at = qs('#autoToggle');
    if (at) {
      at.hidden = false; syncAuto();
      at.addEventListener('click', function () {
        S.auto = !S.auto; store('syg-autoscroll', S.auto); syncAuto(); syncLoadBtn();
        toast(S.auto ? '∞ Auto-scroll on — groups load as you scroll' : 'Auto-scroll off — tap “Load more” for more groups');
        if (S.auto && sentinelNear) more();
      });
    }
  }
  var sentinelNear = false;
  function syncAuto() {
    var at = qs('#autoToggle'); if (!at) return;
    at.setAttribute('aria-pressed', S.auto ? 'true' : 'false');
    at.title = S.auto ? 'Auto-scroll is on (tap to turn off)' : 'Auto-scroll is off (tap to turn on)';
    var s = qs('.auto-state', at); if (s) s.textContent = S.auto ? 'ON' : 'OFF';
  }
  function syncLoadBtn() {
    if (!app || !grid) return;
    var lm = qs('.load-more', app), needBtn = (!io || !S.auto) && S.shown < S.view.length;
    if (needBtn && !lm) {
      app.insertAdjacentHTML('beforeend', '<div class="load-more">' +
        '<button class="lm-btn" type="button"><span class="lm-ic"><svg aria-hidden="true" class="i" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"></path></svg></span>' +
        '<span class="lm-label"></span><span class="lm-left"></span></button>' +
        '<div class="lm-meta"><span class="lm-count"></span><span class="lm-bar"><i></i></span></div></div>');
      lm = qs('.load-more', app);
      qs('.lm-btn', lm).addEventListener('click', more);
    } else if (!needBtn && lm) { lm.remove(); return; }
    if (lm && needBtn) {
      var left = S.view.length - S.shown;
      qs('.lm-count', lm).textContent = 'Showing ' + fmt(S.shown) + ' of ' + fmt(S.view.length);
      qs('.lm-bar i', lm).style.width = Math.round(S.shown / S.view.length * 100) + '%';
      qs('.lm-label', lm).textContent = 'Show ' + Math.min(C.perPage, left) + ' more';
      qs('.lm-left', lm).textContent = fmt(left) + ' left';
    }
  }
  function syncSeg() { qsa('[data-type]', app).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-type') === S.type ? 'true' : 'false'); }); }
  function renderChips() {
    var counts = {}; S.all.forEach(function (g) { counts[g.cat] = (counts[g.cat] || 0) + 1; });
    renderCatsMenu(counts);
    var list = CATS.filter(function (c) { return counts[c.id]; }).sort(function (a, b) { return (a.id === 'others') - (b.id === 'others') || counts[b.id] - counts[a.id]; });
    chipsEl.innerHTML = '<button class="chip" data-chip="all" type="button">🔥 All <span class="n">' + fmt(S.all.length) + '</span></button>' +
      list.map(function (c) { return '<button class="chip" data-chip="' + c.id + '" type="button">' + c.e + ' ' + esc(c.label) + ' <span class="n">' + counts[c.id] + '</span></button>'; }).join('');
    syncChips();
  }
  function syncChips() {
    qsa('[data-chip]', chipsEl).forEach(function (b) {
      var on = b.getAttribute('data-chip') === S.cat;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && b.scrollIntoView && S.cat !== 'all') b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }
  function setCat(id) {
    if (!app) { location.href = '/?cat=' + encodeURIComponent(id) + '#explore'; return; }
    S.cat = CAT[id] ? id : 'all'; syncChips(); apply(); if (app) app.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function shuffleKey(id) { return hue(id + S.seed); }
  function apply() {
    var terms = norm(S.q).split(/\s+/).filter(Boolean);
    S.view = S.all.filter(function (g) {
      if (S.cat !== 'all' && g.cat !== S.cat) return false;
      if (S.type === 'groups' && g.ch) return false;
      if (S.type === 'channels' && !g.ch) return false;
      for (var i = 0; i < terms.length; i++) if (g.s.indexOf(terms[i]) < 0) return false;
      return true;
    });
    if (S.sort === 'az') S.view.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (S.sort === 'mix') S.view.sort(function (a, b) { return shuffleKey(a.id) - shuffleKey(b.id); });
    else S.view.sort(function (a, b) { return b.t - a.t; });
    S.shown = 0; adTurn = 0; grid.innerHTML = ''; syncLoadBtn();
    var filtered = S.q || S.cat !== 'all' || S.type !== 'all';
    resultEl.textContent = fmt(S.view.length) + (S.view.length === 1 ? ' result' : ' results') + (S.q ? ' for “' + S.q + '”' : '') + (S.cat !== 'all' ? ' in ' + CAT[S.cat].label : '');
    resetBtn.hidden = !filtered;
    if (!S.view.length) {
      grid.innerHTML = '<div class="empty"><div class="big">🫥</div><h3>No groups match that yet</h3><p>Try another keyword — or be the first and drop yours.</p><button class="btn btn-primary" data-open-submit="1" type="button">Submit a group</button></div>';
    } else more();
    writeURL();
    if (S.q) track('search', { search_term: S.q });
  }
  function more() {
    if (!grid || S.shown >= S.view.length) return;
    var next = S.view.slice(S.shown, S.shown + C.perPage), html = '';
    next.forEach(function (g, i) {
      var pos = S.shown + i;
      if (C.adEvery && pos > 0 && pos % C.adEvery === 0) html += adCard();
      html += card(g);
    });
    S.shown += next.length;
    grid.insertAdjacentHTML('beforeend', html);
    qsa('.g-ad ins.adsbygoogle:not([data-pushed])', grid).forEach(pushAd);
    syncLoadBtn();
  }
  /* load an AdSense slot only once it has a real width (a 0-width slot errors and stays blank) */
  function pushAd(ins, tries) {
    if (ins.getAttribute('data-pushed')) return;
    if (!ins.offsetWidth) { if ((tries || 0) < 20) setTimeout(function () { pushAd(ins, (tries || 0) + 1); }, 250); return; }
    ins.setAttribute('data-pushed', '1');
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }
  function byId(id) { return REG[id] || null; }

  function heroFill() {
    var day = Date.now() - 864e5, ch = 0, today = 0;
    S.all.forEach(function (g) { if (g.ch) ch++; if (g.t > day) today++; });
    var set = function (k, v) { qsa('[data-stat="' + k + '"]').forEach(function (e) { e.textContent = v; }); };
    set('total', fmt(S.all.length)); set('channels', fmt(ch)); set('today', fmt(today));
    set('updated', S.updated ? 'updated ' + ago(Date.parse(S.updated)) : 'live');
    var stack = qs('.hero-stack');
    if (stack) stack.innerHTML = S.all.slice().sort(function (a, b) { return b.t - a.t; }).filter(function (g) { return g.img; }).slice(0, 3).map(card).join('');
  }

  function load() {
    var first = C.dataUrl ? getJSON(bust(C.dataUrl)) : Promise.reject(new Error('no dataUrl'));
    first.catch(function () { return getJSON(C.apiUrl); }).then(function (j) {
      var seen = {};
      S.updated = j && j.updated;
      S.all = listOf(j).map(toGroup).filter(function (g) { if (!g || seen[g.id]) return false; seen[g.id] = 1; return true; });
      renderChips(); heroFill(); apply(); deepLink();
      liveSync(true);
      if (C.livePoll > 0) setInterval(function () { if (!d.hidden) liveSync(false); }, C.livePoll * 1000);
    }).catch(function () {
      grid.innerHTML = '<div class="empty"><div class="big">📡</div><h3>Couldn’t load groups</h3><p>Check your connection and try again.</p><button class="btn btn-ghost" onclick="location.reload()" type="button">Retry</button></div>';
      resultEl.textContent = 'offline';
    });
  }
  /* pull in groups submitted since the GitHub copy; on the first run just show them, later offer a "new groups" button */
  var pill, pending = 0;
  function liveSync(first) {
    recent(S.updated).then(function (raw) {
      var n = merge(S.all, raw);
      if (!raw.length) return;
      renderChips(); heroFill();
      var nearTop = window.pageYOffset < app.offsetTop + 300;
      if (first || nearTop) { apply(); return; }
      if (!n) return;
      pending += n;
      if (!pill) {
        pill = d.createElement('button'); pill.type = 'button'; pill.className = 'new-pill';
        pill.addEventListener('click', function () { pending = 0; pill.remove(); pill = null; apply(); app.scrollIntoView({ behavior: 'smooth' }); });
        body.appendChild(pill);
      }
      pill.textContent = '↑ ' + pending + ' new group' + (pending === 1 ? '' : 's');
    });
  }
  newListeners.push(function (g, isNew) {
    if (!grid) return;
    if (isNew) S.all.unshift(g);
    renderChips(); heroFill(); apply();
  });

  /* ---------- share / deep link / report ---------- */
  /* branded link that opens the site filtered to this one card, e.g. /?type=channels&q=Name#explore */
  function groupUrl(g) {
    var p = new URLSearchParams(); p.set('type', g.ch ? 'channels' : 'groups'); p.set('q', g.name || '');
    return location.origin + '/?' + p.toString() + '#explore';
  }
  /* ---------- share panel: app buttons, opened inside the card ---------- */
  var APP_ICON = {
    wa: '<svg class="i f" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.42 1.3-1.96 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.56.79 1.92.86 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.65-.17 1.33z"/></svg>',
    tg: '<svg class="i f" viewBox="0 0 24 24"><path d="M21.9 4.6 18.7 19.7c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.2c.4-.4-.1-.6-.6-.2L6.3 13.3l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.6z"/></svg>',
    fb: '<svg class="i f" viewBox="0 0 24 24"><path d="M14 9h3V5.5h-3c-2.2 0-4 1.8-4 4V12H7.5v3.5H10V22h3.5v-6.5H16l.7-3.5h-3.2V9.5c0-.3.2-.5.5-.5z"/></svg>',
    x: '<svg class="i f" viewBox="0 0 24 24"><path d="M17.5 3h3.2l-7 8 8.3 10h-6.5l-5-6.2L4.8 21H1.6l7.5-8.6L1.2 3h6.6l4.6 5.7L17.5 3zm-1.1 16h1.8L6.7 4.9H4.8L16.4 19z"/></svg>',
    rd: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="14" r="7"/><circle cx="18.5" cy="5.5" r="1.5"/><path d="M12 7l1.5-4 5 2.5M9.5 13h.01M14.5 13h.01M9.5 16.5c1.5 1 3.5 1 5 0"/></svg>',
    copy: '<svg class="i" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    more: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };
  /* Shares carry the branded site link that opens straight to this card; the invite link stays behind the join gate. */
  function shareText(g) { return 'Join “' + g.name + '” on ShareYourGroup 👇'; }
  function shareMessage(g) { return shareText(g) + '\n' + groupUrl(g); }
  function sharePanel(g) {
    var url = groupUrl(g), msg = shareMessage(g);
    var u = encodeURIComponent(url), m = encodeURIComponent(msg);
    var apps = [
      ['wa', 'WhatsApp', 'https://api.whatsapp.com/send?text=' + m],
      ['tg', 'Telegram', 'https://t.me/share/url?url=' + u + '&text=' + encodeURIComponent(shareText(g))],
      ['fb', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + u + '&quote=' + encodeURIComponent(shareText(g))],
      ['x', 'X', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(g)) + '&url=' + u],
      ['rd', 'Reddit', 'https://www.reddit.com/submit?url=' + u + '&title=' + encodeURIComponent(g.name + ' (WhatsApp group)')]
    ];
    return '<div class="g-share" role="group" aria-label="Share ' + esc(g.name) + '">' +
      '<div class="g-share-head"><b>Share to…</b><button aria-label="Close" class="icon-btn" data-share-close="1" type="button">' + ICON.x + '</button></div>' +
      '<div class="g-share-apps">' +
      apps.map(function (a) { return '<a aria-label="Share on ' + a[1] + '" class="app app-' + a[0] + '" data-share-app="' + a[0] + '" href="' + esc(a[2]) + '" rel="noopener" target="_blank" title="' + a[1] + '"><span>' + APP_ICON[a[0]] + '</span></a>'; }).join('') +
      '<button aria-label="Copy link" class="app app-copy" data-copy-link="' + esc(url) + '" title="Copy link" type="button"><span>' + APP_ICON.copy + '</span></button>' +
      (navigator.share ? '<button aria-label="More apps" class="app app-more" data-native-share="' + esc(g.id) + '" title="More apps" type="button"><span>' + APP_ICON.more + '</span></button>' : '') +
      '</div><input aria-label="Link to this group" class="g-share-url" readonly="readonly" value="' + esc(url) + '"/></div>';
  }
  /* toggles the panel inside the card; outside a card (popups) it opens in a popup */
  function share(g, el) {
    var cardEl = el && el.closest('.g-card');
    track('share_open', { item_id: g.id });
    if (!cardEl || cardEl.closest('.hero-stack')) { openDialog('Share “' + g.name + '”', sharePanel(g)); return; }
    var open = qs('.g-share', cardEl);
    closeShares();
    if (open) return;   // second tap closes it
    cardEl.insertAdjacentHTML('beforeend', sharePanel(g));   // sits over the card, so the card never changes size
    el.setAttribute('aria-expanded', 'true');
    var first = qs('.g-share .app', cardEl); if (first) first.focus({ preventScroll: true });
  }
  function closeShares() {
    qsa('.g-card .g-share').forEach(function (p) { p.remove(); });
    qsa('.g-card [data-share][aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function copyText(s, input) {
    var ok = function () { toast('Link copied ✓'); };
    var fallback = function () { if (input) { input.focus(); input.select(); toast('Press Ctrl+C / long-press to copy'); } else toast(s); };
    try { if (navigator.clipboard) { navigator.clipboard.writeText(s).then(ok, fallback); return; } } catch (e) {}
    fallback();
  }
  function deepLink() {
    var id = new URLSearchParams(location.search).get('g');
    if (!id) return;
    var g = byId(id);
    if (!g) { toast('That group isn’t live anymore 😕'); return; }
    var c = CAT[g.cat];
    openDialog(g.ch ? 'Channel' : 'Group', '<div class="g-feature">' + avatar(g) + '<h3>' + esc(g.name) + '</h3><div class="g-sub">' + c.e + ' ' + esc(c.label) + (g.t ? ' · ' + ago(g.t) : '') + '</div>' +
      (g.desc ? '<p class="g-desc" style="-webkit-line-clamp:6">' + esc(g.desc) + '</p>' : '') +
      '<a class="btn btn-primary" ' + joinAttrs(g) + '>Join now ' + ICON.arrow + '</a>' +
      '<button class="btn btn-ghost" data-share="' + esc(g.id) + '" type="button">' + ICON.share + ' Share</button></div>');
  }
  function report(g) {
    var done = store('syg-reported') || [];
    if (done.indexOf(g.id) > -1) { toast('Already reported — thanks!'); return; }
    var reasons = [['dead', '🔗 Link not working'], ['spam', '🚫 Spam or scam'], ['adult', '🔞 Adult content'], ['hate', '😡 Hate or violence'], ['other', '🤔 Something else']];
    openDialog('Report “' + g.name + '”', '<p style="color:var(--muted);margin-top:0">What’s wrong with this listing?</p><div class="reasons">' +
      reasons.map(function (r) { return '<button class="chip" data-reason="' + r[0] + '" type="button">' + r[1] + '</button>'; }).join('') + '</div>', function (box) {
      qsa('[data-reason]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          done.push(g.id); store('syg-reported', done);
          api({ action: 'report', group_link: g.link, reason: b.getAttribute('data-reason') }).catch(function () {});
          closeDialog(); toast('Thanks — we’ll review it 🙏');
        });
      });
    });
  }

  /* ---------- submit ---------- */
  function api(payload) {
    return fetch(C.apiUrl, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: /success/i.test(t), status: 'pending' }; } });
  }
  function catOptions() {
    return '<option value="">Pick one…</option>' + CATS.map(function (c) { return '<option value="' + c.id + '">' + c.e + ' ' + esc(c.label) + '</option>'; }).join('');
  }
  function submitForm() {
    return '<form class="submit-form" novalidate="novalidate">' +
      '<label class="field"><span>Group or channel link <small>required</small></span><input inputmode="url" name="link" placeholder="https://chat.whatsapp.com/…" required="required" type="url"/></label>' +
      '<label class="field"><span>Category <small>required</small></span><select name="cat" required="required">' + catOptions() + '</select></label>' +
      '<label class="field"><span>Short description <small><b data-count="1">0</b>/200</small></span><textarea maxlength="200" name="desc" placeholder="What’s it about? Any rules?" rows="3"></textarea></label>' +
      '<p class="rule-note">By publishing you confirm your group follows the <a href="/#rules">sharing rules</a>.</p>' +
      '<button class="btn btn-primary" style="width:100%" type="submit">Publish my group 🚀</button><p class="form-msg" role="status"></p></form>';
  }
  function bindSubmit(form, prefill, topic) {
    var link = form.elements.link, msg = qs('.form-msg', form), btn = qs('button[type=submit]', form), cnt = qs('[data-count]', form);
    if (prefill) link.value = prefill;
    form.elements.desc.addEventListener('input', function () { cnt.textContent = this.value.length; });
    function say(t, cls) { msg.textContent = t; msg.className = 'form-msg' + (cls ? ' is-' + cls : ''); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = normaliseLink(link.value), cat = form.elements.cat.value, desc = form.elements.desc.value.trim();
      if (!LINK_RE.test(url)) { say('That doesn’t look like a WhatsApp group or channel link.', 'error'); link.focus(); return; }
      if (!cat) { say('Pick a category so people can find it.', 'error'); form.elements.cat.focus(); return; }
      var m = CODE_RE.exec(url), existing = m && byId(m[2]);
      btn.disabled = true; btn.textContent = 'Publishing…'; say('');
      api({ action: 'submit', group_link: url, category: cat, description: desc, topic: topic || '' }).then(function (r) {
        btn.disabled = false; btn.textContent = 'Publish my group 🚀';
        if (!r || r.ok === false) { say((r && r.message) || 'Couldn’t submit right now. Try again in a minute.', 'error'); return; }
        track('submit_group', { category: cat, status: r.status });
        if (r.status === 'rejected') { say(r.message || 'This group can’t be listed — it breaks our rules.', 'error'); return; }
        if (r.status === 'live' && m) {
          var g = existing || toGroup({ id: m[2], n: r.name || 'Your group', l: url, i: r.image || '', t: Date.now(), c: cat, d: desc, ch: m[1] === 'channel' ? 1 : 0, p: topic || '' });
          g.t = Date.now(); g.hl = true;
          if (topic && !inTopic(g, topic)) g.p = g.p ? g.p + ',' + topic : topic;
          newListeners.forEach(function (fn) { fn(g, !existing); });
        }
        form.outerHTML = '<div class="g-feature"><div style="font-size:3rem">🎉</div><h3>' + (r.status === 'live' ? 'You’re live!' : 'Got it!') + '</h3><p style="color:var(--muted)">' +
          esc(r.message || (r.status === 'live' ? 'Your group is on the list. Share it to get members faster.' : 'We’re fetching your group’s details — it will appear in a few minutes.')) + '</p>' +
          (m ? '<button class="btn btn-ghost" data-share-new="' + esc(m[2]) + '" type="button">' + ICON.share + ' Share my listing</button>' : '') + '</div>';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Publish my group 🚀'; say('Network hiccup — please try again.', 'error'); });
    });
  }
  var pageTopic = '';        // set on blog posts that have their own group list
  function openSubmit(prefill, topic) {
    topic = topic || pageTopic;
    withRules(function () {
      openDialog(topic ? 'Add your group to this list' : 'Drop your group', submitForm(), function (box) { bindSubmit(qs('form', box), prefill, topic); if (!prefill) qs('input', box).focus(); });
    });
  }

  /* ---------- "before you share" and "before you join" popups ---------- */
  function sess(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function rulesAgreed() { return sess('syg-rules-ok') === '1'; }
  /* EDIT: the rules people agree to before sharing */
  var RULES_HTML = '<div class="rule rule-ok"><b>✅ Share</b><ul><li>An active invite link that works</li><li>A clear name and an honest description</li><li>The category that really fits</li></ul></div>' +
    '<div class="rule rule-no"><b>🚫 Never share</b><ul><li>Adult / 18+ content or “paid friendship” groups</li><li>“Earn money”, money-doubling or other scams</li><li>Selling phone numbers, OTPs or accounts</li><li>Hate, violence, drugs or fake news</li></ul></div>' +
    '<p class="rule-note">Listings that break these rules are removed. Links that get reported several times are hidden automatically.</p>';
  /* asked once per visit; then the form opens straight away */
  function withRules(then) {
    if (rulesAgreed()) { then(); return; }
    openDialog('Before you share 📌', RULES_HTML +
      '<label class="check"><input id="rulesOk" type="checkbox"/><span>I agree — my group follows these rules.</span></label>' +
      '<button class="btn btn-primary" disabled="disabled" id="rulesGo" style="width:100%" type="button">Continue</button>', function (box) {
      var cb = qs('#rulesOk', box), go = qs('#rulesGo', box);
      cb.addEventListener('change', function () { go.disabled = !cb.checked; });
      go.addEventListener('click', function () { sess('syg-rules-ok', '1'); track('agree_rules'); closeDialog(); then(); });
    });
  }
  /* any link box: the first time someone clicks into it, show the rules */
  function gateFocus(scope) {
    scope.addEventListener('focusin', function (e) {
      if (rulesAgreed() || !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      var el = e.target; el.blur();
      withRules(function () { el.focus(); });
    });
  }
  /* EDIT: safety tips shown before joining */
  var JOIN_TIPS = [
    ['📱', 'Everyone in the group can see your phone number.'],
    ['🔐', 'Never share OTPs, passwords, UPI PINs or bank details — with anyone.'],
    ['💸', 'Don’t pay to “join”, “unlock” or “earn”. That’s a scam.'],
    ['🔗', 'Don’t install APK files or open unknown links posted in groups.'],
    ['🚩', 'Feels wrong? Leave the group and report it here.']
  ];
  /* The Join button only becomes a real link once the visitor has agreed to the tips ("don't show again").
     Until then it has no href at all, so nothing can open WhatsApp before the popup is answered. */
  function joinAttrs(g) {
    return 'data-join="' + esc(g.id) + '" ' + (store('syg-join-tips-off')
      ? 'href="' + esc(g.link) + '" rel="nofollow noopener" target="_blank"'
      : 'role="button" tabindex="0"');
  }
  function joinGate(el, e) {
    var g = byId(el.getAttribute('data-join'));
    if (!g) return;
    if (el.getAttribute('href')) { track('join_group', { item_id: g.id }); return; }   // tips already accepted
    e.preventDefault();
    openDialog('Before you join 👋', '<p class="join-name">' + esc(g.name) + '</p><ul class="tips">' +
      JOIN_TIPS.map(function (t) { return '<li><span aria-hidden="true">' + t[0] + '</span>' + esc(t[1]) + '</li>'; }).join('') + '</ul>' +
      '<label class="check"><input id="joinOk" type="checkbox"/><span><b>I understand</b> these safety tips.</span></label>' +
      '<label class="check"><input id="tipsOff" type="checkbox"/><span>Don’t show this again</span></label>' +
      '<div class="row-btns"><button class="btn btn-ghost" data-close="1" type="button">Cancel</button>' +
      '<a aria-disabled="true" class="btn btn-primary is-disabled" id="joinGo" role="button" tabindex="0">Continue to WhatsApp ' + ICON.arrow + '</a></div>', function (box) {
      var ok = qs('#joinOk', box), go = qs('#joinGo', box);
      ok.addEventListener('change', function () {
        if (ok.checked) {
          go.setAttribute('href', g.link); go.setAttribute('target', '_blank'); go.setAttribute('rel', 'nofollow noopener');
          go.removeAttribute('aria-disabled'); go.removeAttribute('role'); go.classList.remove('is-disabled');
        } else {
          go.removeAttribute('href'); go.setAttribute('aria-disabled', 'true'); go.setAttribute('role', 'button'); go.classList.add('is-disabled');
        }
      });
      go.addEventListener('click', function (ev) {
        if (!ok.checked) { ev.preventDefault(); toast('Tick “I understand” first 👆'); ok.focus(); return; }
        if (qs('#tipsOff', box).checked) {
          store('syg-join-tips-off', 1);
          qsa('a[data-join]:not([href])').forEach(function (a) { var x = byId(a.getAttribute('data-join')); if (x) { a.href = x.link; a.target = '_blank'; a.rel = 'nofollow noopener'; a.removeAttribute('role'); } });
        }
        track('join_group', { item_id: g.id });
        setTimeout(closeDialog, 150);
      });
    });
  }

  /* ---------- global clicks + keys ---------- */
  d.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-open-submit]'))) { e.preventDefault(); setNav(false); openSubmit(); return; }
    if ((el = t.closest('[data-share]'))) { var g = byId(el.getAttribute('data-share')); if (g) share(g, el); return; }
    if ((el = t.closest('[data-share-new]'))) {
      var id = el.getAttribute('data-share-new');
      var ng = byId(id) || { id: id, name: 'my group', link: '' };
      openDialog('Share your listing', sharePanel(ng));
      return;
    }
    if ((el = t.closest('[data-share-close]'))) { closeShares(); return; }
    if ((el = t.closest('[data-share-app]'))) { track('share', { method: el.getAttribute('data-share-app') }); return; }
    if ((el = t.closest('[data-copy-link]'))) { track('share', { method: 'copy' }); copyText(el.getAttribute('data-copy-link'), qs('.g-share-url', el.closest('.g-share'))); return; }
    if ((el = t.closest('[data-native-share]'))) {
      var sg = byId(el.getAttribute('data-native-share'));
      if (sg) navigator.share({ title: sg.name, text: shareText(sg), url: groupUrl(sg) }).catch(function () {});
      return;
    }
    if ((el = t.closest('[data-open-tools]'))) {
      e.preventDefault(); setNav(false);
      var panel = qs('.mega-tools');
      openDialog('Tools', '<div class="mega-tools tools-sheet">' + (panel ? panel.innerHTML : '') + '</div>');
      return;
    }
    if ((el = t.closest('[data-report]'))) { var r = byId(el.getAttribute('data-report')); if (r) report(r); return; }
    if ((el = t.closest('[data-chip]'))) {
      if (!app) return;            // menu links on other pages just go to /?cat=…
      e.preventDefault(); setNav(false);
      qsa('.nav-drop[open]').forEach(function (x) { x.removeAttribute('open'); });
      setCat(el.getAttribute('data-chip')); return;
    }
    if ((el = t.closest('[data-cat]'))) { closeDialog(); setCat(el.getAttribute('data-cat')); return; }
    if ((el = t.closest('[data-join]'))) { joinGate(el, e); return; }
    if ((el = t.closest('[data-focus-search]'))) {
      e.preventDefault(); setNav(false);
      if (searchIn) { app.scrollIntoView({ behavior: 'smooth' }); setTimeout(function () { searchIn.focus(); }, 350); } else location.href = '/#explore';
    }
  });
  d.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (e.key === '/' && !typing && searchIn) { e.preventDefault(); searchIn.focus(); }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('.g-cat')) setCat(e.target.getAttribute('data-cat'));
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]:not(button)')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape') { setNav(false); closeShares(); }
  });
  qsa('form[data-drop]').forEach(function (f) {
    gateFocus(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = normaliseLink(qs('input', f).value);
      if (v && !LINK_RE.test(v)) { toast('Paste a chat.whatsapp.com or whatsapp.com/channel link'); return; }
      openSubmit(v); qs('input', f).value = '';
    });
  });

  if (app) { buildExplorer(); load(); }

  /* ---------- quick tour (first visit to the homepage, or the ? button) ---------- */
  var isPhone = function () { return window.matchMedia('(max-width: 900px)').matches; };
  /* EDIT: tour steps (sel = what to highlight) */
  function tourSteps() {
    return [
      { sel: 'form[data-drop]', title: 'Drop your group 🚀', text: 'Paste a WhatsApp group or channel invite link here and tap Drop it. It goes live in seconds, no signup.' },
      { sel: '#sygSearch', title: 'Search everything', text: 'Type a topic, city or exam: jobs, Dubai, NEET… On a keyboard, press / to jump here.' },
      { sel: '#syg-app .chips', title: 'Browse by category', text: 'Tap a category to see only those groups. The number shows how many are listed.' },
      { sel: '#syg-app .seg', title: 'Groups or channels', text: 'In groups everyone can chat. Channels are one-way updates and keep your number hidden.' },
      { sel: '#syg-app .grid .g-card .g-actions', title: 'Join, share or report', text: 'Join shows a few safety tips first. Share sends the group to WhatsApp, Telegram and more. The flag reports a bad or dead link.' },
      { sel: '#autoToggle', title: 'Auto-scroll', text: 'ON keeps loading groups as you scroll. Turn it OFF to reach the bottom of the page and load more with a button.' },
      { sel: isPhone() ? '.tabbar .tab-add' : '.header-cta', title: 'Submit any time', text: 'This button opens the submit form from anywhere on the site.' },
      { sel: isPhone() ? '#menuToggle' : '.tour-btn', title: 'That’s it! 🎉', text: isPhone() ? 'Replay this tour any time from the menu → Take a quick tour.' : 'Replay this tour any time with this ? button.' }
    ];
  }
  var tour = null;
  function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function isFixed(el) { for (var n = el; n && n !== body; n = n.parentElement) { if (getComputedStyle(n).position === 'fixed') return true; } return false; }
  function startTour() {
    if (tour || !app) return;
    closeDialog(); setNav(false);
    var steps = tourSteps().filter(function (s) { return visible(qs(s.sel)); });
    if (!steps.length) return;
    var box = d.createElement('div');
    box.className = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'tourTitle');
    box.innerHTML = '<div class="tour-spot"></div><div class="tour-pop"><div class="tour-count"></div><h3 id="tourTitle"></h3><p></p>' +
      '<div class="tour-btns"><button class="tour-skip" type="button">Skip tour</button><span></span><button class="btn btn-ghost btn-sm tour-back" type="button">Back</button><button class="btn btn-primary btn-sm tour-next" type="button">Next</button></div></div>';
    body.appendChild(box);
    tour = { box: box, steps: steps, i: 0 };
    qs('.tour-next', box).addEventListener('click', function () { tourGo(tour.i + 1); });
    qs('.tour-back', box).addEventListener('click', function () { tourGo(tour.i - 1); });
    qs('.tour-skip', box).addEventListener('click', endTour);
    box.addEventListener('click', function (e) { if (e.target === box) tourGo(tour.i + 1); });
    window.addEventListener('resize', placeTour); window.addEventListener('scroll', placeTour, { passive: true });
    track('tour_start');
    tourGo(0);
  }
  function tourGo(i) {
    if (!tour) return;
    if (i >= tour.steps.length) { track('tour_done'); endTour(); return; }
    tour.i = Math.max(0, i);
    var s = tour.steps[tour.i], el = qs(s.sel), box = tour.box;
    qs('.tour-count', box).textContent = (tour.i + 1) + ' / ' + tour.steps.length;
    qs('h3', box).textContent = s.title; qs('p', box).textContent = s.text;
    qs('.tour-back', box).hidden = tour.i === 0;
    qs('.tour-next', box).textContent = tour.i === tour.steps.length - 1 ? 'Done' : 'Next';
    if (!isFixed(el)) {
      var r = el.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, r.top + window.pageYOffset - (window.innerHeight / 2 - Math.min(r.height, 300) / 2)), behavior: 'instant' });
    }
    tour.el = el; placeTour();
    qs('.tour-next', box).focus({ preventScroll: true });
  }
  function placeTour() {
    if (!tour || !tour.el) return;
    var r = tour.el.getBoundingClientRect(), pad = 8, spot = qs('.tour-spot', tour.box), pop = qs('.tour-pop', tour.box);
    spot.style.cssText = 'top:' + (r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
    var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 14;
    var top = r.bottom + pad + gap;
    if (top + ph > vh - 10) top = r.top - pad - gap - ph;          // not enough room below: go above
    if (top < 10) top = Math.min(vh - ph - 10, Math.max(10, r.bottom + pad + gap));
    var left = Math.min(vw - pw - 12, Math.max(12, r.left + r.width / 2 - pw / 2));
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
  }
  function endTour() {
    if (!tour) return;
    tour.box.remove(); tour = null; store('syg-tour-done', 1);
    window.removeEventListener('resize', placeTour); window.removeEventListener('scroll', placeTour);
  }
  d.addEventListener('keydown', function (e) {
    if (!tour) return;
    if (e.key === 'Escape') endTour();
    if (e.key === 'ArrowRight') tourGo(tour.i + 1);
    if (e.key === 'ArrowLeft') tourGo(tour.i - 1);
  });
  d.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tour]');
    if (!t) return;
    e.preventDefault();
    if (app) { startTour(); } else location.href = '/#tour';
  });
  /* first visit: start once groups are on screen (not when someone opened a shared group link) */
  function maybeAutoTour() {
    if (!app || tour) return;
    var asked = location.hash === '#tour';
    if (!asked && (store('syg-tour-done') || new URLSearchParams(location.search).get('g'))) return;
    var tries = 0, wait = setInterval(function () {
      if (qs('#syg-app .grid .g-card:not(.sk)') && !(dlg && dlg.open)) { clearInterval(wait); setTimeout(startTour, asked ? 200 : 1200); }
      else if (++tries > 40) clearInterval(wait);
    }, 250);
  }
  maybeAutoTour();

  /* ---------- AdSense: keep the layout steady ----------
     - anchor ads (sticky bar at the top/bottom of phones): measure them and move the header,
       tab bar, floating buttons and popups out of their way (CSS uses --ad-top / --ad-bottom)
     - unfilled slots: fold the empty "sponsored" box away */
  (function adWatch() {
    var t;
    function sync() {
      var top = 0, bottom = 0, h = window.innerHeight;
      qsa('ins.adsbygoogle[data-anchor-status]').forEach(function (a) {
        if (a.getAttribute('data-anchor-status') !== 'displayed') return;
        var r = a.getBoundingClientRect();
        if (!r.height || r.bottom <= 0 || r.top >= h) return;
        if (r.top < h / 2) top = Math.max(top, Math.round(r.bottom)); else bottom = Math.max(bottom, Math.round(h - r.top));
      });
      root.style.setProperty('--ad-top', top + 'px');
      root.style.setProperty('--ad-bottom', bottom + 'px');
      qsa('.g-ad, .ad-wide').forEach(function (box) {
        var ins = qs('ins.adsbygoogle', box);
        if (ins) box.classList.toggle('is-unfilled', ins.getAttribute('data-ad-status') === 'unfilled');
      });
    }
    function later() { clearTimeout(t); t = setTimeout(sync, 120); }
    if ('MutationObserver' in window) {
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var n = list[i].target;
          if (list[i].type === 'childList' || (n.tagName === 'INS' && /adsbygoogle/.test(n.className))) { later(); return; }
        }
      }).observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ad-status', 'data-anchor-status', 'style'] });
    }
    window.addEventListener('resize', later);
    later();
  })();

  /* ---------- Blogger posts & pages ---------- */
  var path = location.pathname;
  var IS_HOME = body.classList.contains('is-home'), IS_ERROR = body.classList.contains('is-error');
  var IS_PAGE = body.classList.contains('is-page'), IS_POST = body.classList.contains('is-post');

  function loadDisqus(after, postId) {
    if (!C.disqus || qs('#disqus_thread')) return;
    after.insertAdjacentHTML('afterend', '<div id="disqus_thread"></div>');
    var canon = qs('link[rel=canonical]');
    window.disqus_config = function () {
      this.page.url = canon ? canon.href : location.href.split(/[?#]/)[0];
      if (postId) this.page.identifier = postId;   // same identifier as the old theme, so old comments stay
    };
    var s = d.createElement('script'); s.src = 'https://' + C.disqus + '.disqus.com/embed.js'; s.setAttribute('data-timestamp', +new Date());
    (d.head || body).appendChild(s);
  }
  function plain(el) { if (!el) return ''; var c = el.cloneNode(true); qsa('style,script,noscript', c).forEach(function (n) { n.remove(); }); return (c.textContent || '').replace(/\s+/g, ' ').trim(); }

  function postCard(o) {
    var a = qs('.post-title a, .entry-title a, h3 a, h2 a', o); if (!a) return '';
    var img = qs('.post-body img, .snippet-thumbnail img, img', o), metaImg = qs('meta[itemprop="image_url"]', o);
    var src = o.getAttribute('data-img') || (img ? (img.getAttribute('src') || img.getAttribute('data-src')) : metaImg && metaImg.getAttribute('content'));
    var txt = plain(qs('.post-body, .snippet-item, .post-snippet', o)) || ((qs('meta[itemprop="description"]', o) || {}).content || '');
    var title = a.textContent.trim(), isList = /whatsapp[- ]group/i.test(title + ' ' + a.href);
    return '<a class="p-card" href="' + esc(a.href) + '"><div class="media">' + (src ? '<img alt="" loading="lazy" src="' + esc(src) + '"/>' : '<span aria-hidden="true">' + (isList ? '💬' : '📖') + '</span>') + '</div>' +
      '<div class="body">' + (isList ? '<span class="g-tag">GROUP LIST</span>' : '') + '<h2>' + esc(title) + '</h2>' + (txt ? '<p>' + esc(txt.slice(0, 150)) + (txt.length > 150 ? '…' : '') + '</p>' : '') + '</div></a>';
  }

  (function adaptBlog() {
    var w = qs('#Blog1');
    if (!w) return;
    if (IS_HOME) {
      /* homepage: the latest posts become a "Latest guides" row under the groups */
      var area = w.closest('.blog-area'), slot = qs('#home-blog-slot');
      var homeOuts = qsa('.post-outer', w); if (!homeOuts.length) homeOuts = qsa('.post', w);
      var homeCards = homeOuts.map(postCard).filter(Boolean).slice(0, 6);
      if (!homeCards.length || !area) { if (area) area.remove(); return; }
      w.innerHTML = '<div class="section-head"><div><span class="eyebrow">explore communities</span><h2>Group lists by city, country &amp; topic</h2></div><a class="btn btn-ghost btn-sm" href="/search">See all lists →</a></div><div class="post-grid">' + homeCards.join('') + '</div>';
      if (slot) slot.parentNode.replaceChild(area, slot);
      area.classList.add('home-blog'); area.id = 'latest-guides';
      return;
    }
    if (IS_ERROR) { w.innerHTML = '<div class="notfound"><div class="code grad">404</div><h1>This page ghosted you 👻</h1><p style="color:var(--muted)">The link may be broken or the page moved.</p><a class="btn btn-primary" href="/">Back to groups</a></div>'; return; }
    var pb = qs('.post-body', w);
    if ((IS_POST || IS_PAGE) && pb) {
      var post = pb.closest('.post-outer-container') || pb.closest('.post') || pb.parentNode;
      post.classList.add('post-wrap'); pb.classList.add('entry');
      var t = qs('.post-title', post), h1 = d.createElement('h1');
      h1.className = 'post-title'; h1.textContent = t ? t.textContent.trim() : d.title;
      if (t) t.parentNode.replaceChild(h1, t); else pb.parentNode.insertBefore(h1, pb);
      h1.insertAdjacentHTML('beforebegin', '<nav aria-label="Breadcrumb" class="crumbs"><a href="/">home</a><span>/</span><span>' + (IS_PAGE ? 'page' : '<a href="/search">blog</a>') + '</span></nav>');
      if (IS_PAGE) { var ph = qs('.post-header', post); if (ph) ph.hidden = true; }
      enhanceEntry(pb);
      loadDisqus(post, (pb.id || '').replace('post-body-', ''));
      return;
    }
    var outs = qsa('.post-outer', w); if (!outs.length) outs = qsa('.post', w);
    var items = [], every = C.postAdEvery;
    outs.map(postCard).filter(Boolean).forEach(function (h, i) {   // an ad card after every few articles
      if (every && i > 0 && i % every === 0) { var ad = adCard(); if (ad) items.push(ad); }
      items.push(h);
    });
    var q = new URLSearchParams(location.search).get('q'), lm = /^\/search\/label\/([^\/?#]+)/.exec(path);
    var head = '<header class="feed-head"><span class="eyebrow">' + (q ? 'search' : lm ? 'topic' : 'group lists &amp; guides') + '</span><h1>' +
      (q ? 'Results for “' + esc(q) + '”' : lm ? '#' + esc(decodeURIComponent(lm[1])) : 'Find your <span class="grad">community</span>') + '</h1>' +
      (q ? '<p>Looking for a group instead? <a class="grad" href="/?q=' + encodeURIComponent(q) + '#explore">Search groups for “' + esc(q) + '” →</a></p>' : '<p>Hand-picked WhatsApp group links by city, country and topic, plus tips for running your own group.</p>') + '</header>';
    var list = qs('.blog-posts', w) || w;
    list.innerHTML = head + (items.length ? '<div class="post-grid">' + items.join('') + '</div>' : '<div class="empty"><div class="big">🔍</div><h3>No posts found</h3><p>Try a different keyword.</p></div>');
    qsa('.g-ad ins.adsbygoogle:not([data-pushed])', list).forEach(function (ins) { pushAd(ins); });
  })();

  /* ---------- group list inside a blog post ----------
     Works with the old post code (form#groupLinkForm + #linksContainer + const webAppUrl) without editing
     the post, or with a new placeholder: <div data-syg="groups" data-topic="any-name"></div> */
  function topicWidget(entry) {
    var host = qs('[data-syg="groups"]', entry), topic = host && host.getAttribute('data-topic');
    var oldForm = qs('#groupLinkForm', entry), oldList = qs('#linksContainer', entry), legacy = '';
    if (!host && !oldForm && !oldList) return;
    try { legacy = typeof webAppUrl === 'string' ? webAppUrl : ''; } catch (e) {}   // eslint-disable-line no-undef
    if (!topic) topic = topicIdOf(legacy);
    if (!topic) return;
    pageTopic = topic;
    if (!host) { host = d.createElement('div'); var ref = oldForm || oldList; ref.parentNode.insertBefore(host, ref); }
    [oldForm, oldList, qs('#formResponse', entry)].forEach(function (el) { if (el) el.hidden = true; });

    host.className = 't-box';
    host.innerHTML = '<div class="t-head"><div><span class="eyebrow"><span aria-hidden="true" class="live-dot"></span> live list</span><h2 data-t-count="1">Loading groups…</h2></div>' +
      '<button class="btn btn-primary" data-open-submit="1" type="button">+ Add your group</button></div>' +
      '<label class="search">' + ICON.search + '<span class="sr-only">Search this list</span><input autocomplete="off" placeholder="Search this list…" type="search"/></label>' +
      '<div class="grid">' + skeleton(6) + '</div><div class="load-more" hidden="hidden"><button class="btn btn-ghost" type="button">Show more</button></div>';
    var tGrid = qs('.grid', host), tCount = qs('[data-t-count]', host), tIn = qs('input', host), tMore = qs('.load-more', host);
    var all = [], view = [], shown = 0, step = 24;
    tGrid.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

    function render() {
      var terms = norm(tIn.value).split(/\s+/).filter(Boolean);
      view = all.filter(function (g) { for (var i = 0; i < terms.length; i++) if (g.s.indexOf(terms[i]) < 0) return false; return true; })
        .sort(function (a, b) { return b.t - a.t; });
      shown = 0; tGrid.innerHTML = '';
      tCount.textContent = fmt(all.length) + ' group' + (all.length === 1 ? '' : 's') + ' in this list';
      if (!view.length) tGrid.innerHTML = '<div class="empty"><div class="big">🫥</div><h3>' + (all.length ? 'No match' : 'No groups here yet') + '</h3><p>Be the first to add yours.</p><button class="btn btn-primary" data-open-submit="1" type="button">+ Add your group</button></div>';
      page();
    }
    function page() {
      var next = view.slice(shown, shown + step);
      tGrid.insertAdjacentHTML('beforeend', next.map(card).join(''));
      shown += next.length;
      tMore.hidden = shown >= view.length;
    }
    qs('button', tMore).addEventListener('click', page);
    tIn.addEventListener('input', debounce(render, 160));
    newListeners.push(function (g) {
      if (!inTopic(g, topic)) return;
      if (all.indexOf(g) < 0) all.unshift(g);
      render();
    });

    var since = null;
    var fromGitHub = C.topicsUrl ? getJSON(bust(C.topicsUrl + topic + '.json')).then(function (j) { since = j.updated; return listOf(j); }) : Promise.reject();
    fromGitHub
      .catch(function () { return legacy ? getJSON(legacy).then(listOf) : []; })   // not imported yet: read the post's old sheet
      .then(function (list) {
        var seen = {};
        all = list.map(toGroup).filter(function (g) { if (!g || seen[g.id]) return false; seen[g.id] = 1; return true; });
        render(); deepLink();
        // GitHub copy → only what changed since it was made; old sheet → anything submitted here this week
        return recent(since || new Date(Math.floor(Date.now() / 36e5) * 36e5 - 7 * 864e5).toISOString());
      })
      .then(function (raw) {
        if (raw && merge(all, raw, function (g) { return inTopic(g, topic); })) render();
      })
      .catch(function () { tCount.textContent = 'Couldn’t load this list'; tGrid.innerHTML = ''; });
  }

  function enhanceEntry(entry) {
    qsa('img', entry).forEach(function (i) { i.setAttribute('loading', 'lazy'); i.setAttribute('decoding', 'async'); });
    topicWidget(entry);
    /* Submit page: swap the old form for the new one */
    if (/submit-your-group/.test(path)) {
      var old = qs('.submit_group_form', entry) || (qs('#group_link', entry) && (qs('#group_link', entry).closest('form') || qs('#group_link', entry).parentNode));
      var mount = qs('[data-syg="submit"]', entry);
      var box = d.createElement('div'); box.className = 'tile'; box.style.maxWidth = '560px'; box.innerHTML = submitForm();
      if (mount) mount.appendChild(box); else if (old) old.parentNode.replaceChild(box, old); else entry.insertBefore(box, entry.firstChild);
      bindSubmit(qs('form', box));
      gateFocus(box);
    }
    /* Contact page: show Blogger's contact form gadget */
    var cf = qs('.contact-src .contact-form-widget'), cfSpot = qs('[data-syg="contact-form"]', entry);
    if (cf && (cfSpot || /contact/.test(path))) (cfSpot || entry).appendChild(cf);
    /* Direct WhatsApp message tool */
    var wf = qs('.whatsapp_form', entry) || qs('[data-syg="wa-direct"]', entry);
    if (wf) waTool(wf);
    socialCards(entry);
  }

  /* "Find us elsewhere": plain social links become brand-coloured cards with icons.
     A function, not a var, because the page code runs before this point in the file. */
  function socials() { return {
    instagram: { name: 'Instagram', svg: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/>' },
    facebook: { name: 'Facebook', svg: '<path fill="currentColor" d="M13.5 21v-7.5h2.6l.4-3.1h-3V8.5c0-.9.3-1.5 1.6-1.5h1.6V4.2c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H7.9v3.1h2.6V21z"/>' },
    reddit: { name: 'Reddit', svg: '<g fill="currentColor"><ellipse cx="12" cy="14" rx="7.5" ry="5.2"/><circle cx="18.6" cy="9.6" r="1.9"/><circle cx="5.4" cy="9.6" r="1.9"/><circle cx="16.9" cy="4.4" r="1.6"/><path d="m12 8.7 1.2-5.2 3.8.9-.3 1-2.8-.7-1 4.1z"/></g><circle cx="9.3" cy="13.3" r="1.2" fill="#ff4500"/><circle cx="14.7" cy="13.3" r="1.2" fill="#ff4500"/><path d="M9.2 16.2c1.6 1.1 4 1.1 5.6 0" fill="none" stroke="#ff4500" stroke-width="1.1" stroke-linecap="round"/>' },
    whatsapp: { name: 'WhatsApp', svg: '<path fill="currentColor" d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm4.4 12.6c-.2.5-1.1 1-1.6 1-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.4-.5-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.4-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.1z"/>' },
    telegram: { name: 'Telegram', svg: '<path fill="currentColor" d="M20.7 4.3 2.9 11.2c-1.2.5-1.2 1.2 0 1.5l4.6 1.4 1.7 5.4c.2.6.4.8.8.8s.6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14.1c.3-1.3-.5-1.8-1.6-1.4zM9.9 14.2l7.6-6.9c.3-.3 0-.5-.4-.2l-9.4 5.9"/>' }
  }; }
  function socialCards(entry) {
    var SOCIALS = socials();
    qsa('.pg-links', entry).forEach(function (box) {
      var links = qsa('a', box), made = 0;
      links.forEach(function (a) {
        var key = Object.keys(SOCIALS).filter(function (k) { return (a.href || '').indexOf(k === 'whatsapp' ? 'whatsapp.com' : k === 'telegram' ? 't.me' : k + '.com') > -1; })[0];
        if (!key) return;
        var s = SOCIALS[key], handle = (a.href.replace(/\/+$/, '').split('/').pop() || '').replace(/^@/, '');
        a.className = 'soc-card soc-card-' + key;
        a.innerHTML = '<span class="soc-card-ic"><svg aria-hidden="true" viewBox="0 0 24 24">' + s.svg + '</svg></span><span class="soc-card-txt"><b>' + s.name + '</b><small>@' + esc(handle) + '</small></span><svg aria-hidden="true" class="soc-card-go" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        made++;
      });
      if (made) box.classList.add('soc-cards');
    });
  }

  /* a function, not a var: page code (waTool) runs before this line is reached */
  function countries() { return 'IN 91 India|PK 92 Pakistan|BD 880 Bangladesh|NP 977 Nepal|LK 94 Sri Lanka|AE 971 UAE|SA 966 Saudi Arabia|QA 974 Qatar|KW 965 Kuwait|OM 968 Oman|BH 973 Bahrain|US 1 USA / Canada|GB 44 United Kingdom|AU 61 Australia|NZ 64 New Zealand|SG 65 Singapore|MY 60 Malaysia|ID 62 Indonesia|PH 63 Philippines|TH 66 Thailand|NG 234 Nigeria|KE 254 Kenya|GH 233 Ghana|ZA 27 South Africa|EG 20 Egypt|MA 212 Morocco|DZ 213 Algeria|TN 216 Tunisia|TR 90 Turkey|DE 49 Germany|FR 33 France|IT 39 Italy|ES 34 Spain|NL 31 Netherlands|BR 55 Brazil|MX 52 Mexico|AR 54 Argentina|CO 57 Colombia|RU 7 Russia|CN 86 China|JP 81 Japan|KR 82 South Korea'.split('|').map(function (s) { var p = s.split(' '); return { cc: p[0], code: p[1], name: p.slice(2).join(' ') }; }); }
  function flag(cc) { return String.fromCodePoint.apply(null, cc.split('').map(function (c) { return 127397 + c.charCodeAt(0); })); }
  function waTool(el) {
    el.className = 'wa-tool';
    el.innerHTML = '<label class="field"><span>Phone number</span><div class="row"><select aria-label="Country code">' +
      countries().map(function (c) { return '<option value="' + c.code + '">' + flag(c.cc) + ' +' + c.code + ' ' + esc(c.name) + '</option>'; }).join('') +
      '</select><input inputmode="tel" placeholder="98765 43210" type="tel"/></div></label>' +
      '<label class="field"><span>Message</span><textarea placeholder="Type your message…" rows="4"></textarea></label>' +
      '<a class="btn btn-primary" href="#" rel="noopener" style="width:100%" target="_blank">Open in WhatsApp ' + ICON.arrow + '</a>';
    var sel = qs('select', el), tel = qs('input', el), msg = qs('textarea', el), go = qs('a', el);
    go.addEventListener('click', function (e) {
      var num = tel.value.replace(/\D/g, '').replace(/^0+/, '');
      if (num.length < 6) { e.preventDefault(); toast('Enter a valid phone number'); tel.focus(); return; }
      go.href = 'https://api.whatsapp.com/send?phone=' + sel.value + num + (msg.value.trim() ? '&text=' + encodeURIComponent(msg.value.trim()) : '');
    });
  }
})();
