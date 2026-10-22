# shareyourgroup-theme

The new theme for **shareyourgroup.com**. Blogger still runs the site (domain, pages, blog, AdSense).
This repo holds the design, the features and a fast copy of the group list.

```
blogger/theme.xml            → upload to Blogger (Theme → Restore)
assets/syg.css               → all the design (colours at the top)
assets/syg.js                → all the features (search, categories, submit, share, report)
data/groups.json             → group list, rebuilt automatically every 15 min
scripts/build-data.mjs       → builds data/groups.json from the Apps Script
.github/workflows/…          → the 15-minute job + publishing to GitHub Pages
data/topics/<id>.json        → one small list per blog post that has its own groups
apps-script/Code.gs          → new Google Apps Script (replaces all 6 old script files)
apps-script/Topics.gs        → one-time import of the 29 per-post sheets into the main sheet
```

How the pieces talk:

```
Visitor ──loads──▶ Blogger page ──loads──▶ GitHub Pages (syg.css, syg.js, groups.json)   ← instant
        └──asks──▶ Apps Script "?since=…" ──▶ only groups added after that copy          ← ~1 s, cached 60 s
Visitor ──submits group──▶ Apps Script ──writes──▶ Google Sheet
GitHub Action (every 15 min) ──reads Apps Script──▶ commits groups.json ──▶ GitHub Pages
```

So nobody waits 15 minutes: the submitter sees their card at once, and every other visitor gets it on
their next page load (or a "↑ new groups" button appears while they browse).

## Blog posts

- **57 normal articles** (mutual funds, Wealthy…): untouched. They get the new design, a breadcrumb,
  Disqus comments (old comments keep working) and show as cards on `/search`, label pages and the homepage.
- **54 "…-whatsapp-group-links" posts**: each had its own Google Sheet + Apps Script (29 sheets). The theme
  finds the old form + table in the post and swaps them for a searchable card list with its own
  "+ Add your group" button. **You don't need to edit any post.**
  - Before `importTopics()` runs it reads the post's old sheet (slow, like today).
  - After it runs, the list loads instantly from `data/topics/<id>.json`, and new submissions from the post
    go to the main sheet (tagged with that post) and also appear on the homepage.
- New posts with a group list: just put `<div data-syg="groups" data-topic="any-short-name"></div>` in the post.

---

## One-time setup (about 20 minutes)

Do the steps **in this order**. Nothing on the live site changes until step 4.

### 1. Put this folder on GitHub
1. Go to github.com → sign in as **gco-rai-mayank** → **New repository**.
2. Name: `shareyourgroup-theme`, **Public**, no README → **Create repository**.
3. Click **uploading an existing file**, then drag **everything inside this folder** (including the `.github` folder) into the page → **Commit changes**.
   - If the `.github` folder does not upload: **Add file → Create new file**, type the name
     `.github/workflows/sync-groups.yml`, paste the content of that file, and commit.

### 2. Connect GitHub to your Apps Script
1. In the repo: **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `APPS_SCRIPT_URL`. Value: your web app URL (the one ending in `/exec`, same as in `blogger/theme.xml`).
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions** tab → if asked, click **I understand… enable workflows** → open **Sync groups + publish** → **Run workflow**.
5. After about 2 minutes, this link should show your groups:
   `https://gco-rai-mayank.github.io/shareyourgroup-theme/data/groups.json`

### 3. Update the Apps Script (fixes the 13-second load and the missing groups)
1. Open your Google Sheet. **File → Make a copy** first (your backup).
2. **Extensions → Apps Script**.
3. Open `Code.gs`, select all, delete, paste **apps-script/Code.gs** from this repo, and save.
4. Delete the old files `RefreshXMLBatch`, `RemoveError`, `Duplicate`, `Filter`, `RandomDates` (⋮ → Delete).
   Everything they did is now inside `Code.gs`.
5. At the top, choose the function **migrateV2** → **Run** → allow the permissions.
   It turns the IMPORTXML formulas into plain values and adds new columns (category, description, status…).
   It never deletes rows: bad ones get a status like `duplicate`, `rejected` or `pending`.
6. Choose **setup** → **Run**. This removes the old timers and installs the new ones.
7. **+ (Add a file) → Script**, name it `Topics`, paste **apps-script/Topics.gs**, save.
   Choose **importTopics** → **Run**. It copies the 29 blog-post sheets in, a few at a time, and keeps
   going by itself every minute until done (open **Executions** to watch). Your old sheets are not changed.
8. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

### 4. Switch the Blogger theme
1. **Try it on a test blog first**: blogger.com → New blog (free) → Theme → ⌄ next to Customize → **Restore** → upload `blogger/theme.xml`. Open it and click around.
2. Happy? On shareyourgroup.com: **Theme → ⌄ → Backup** (download again, just in case) → **Restore** → upload `blogger/theme.xml`.
3. Open the site in a private window and check: home, a blog post, the Submit page, the Contact page.

**To undo:** Theme → Restore → upload your old backup `.xml`. Takes one minute.

### 5. Small clean-ups after the switch
- **Submit page**: the new form replaces the old one automatically. To tidy it up, edit the page
  in HTML view and replace the old form code with: `<div data-syg="submit"></div>`
- **Promo card between groups** (the Wealthy banner): Blogger → **Layout** → *Promo card between groups*.
  Paste any HTML there, including an AdSense `<ins>` code. The slot is one card wide and two cards tall
  (about 280–340 × 290–350 px), so create a **responsive display ad** in AdSense: it serves 300×250 on
  phones and laptops and 250×250 on wide 4-column screens. Paste only the `<ins …></ins>` part; the theme
  loads it in every ad card automatically.
- **Contact page**: Blogger's contact form is added to `/p/contact-us.html` automatically.

---

## Everyday editing

| I want to… | Edit this | How |
|---|---|---|
| Change colours or fonts | `assets/syg.css` (section 1) | GitHub → file → ✏️ → Commit |
| Change headline, FAQ, menu, footer | `blogger/theme.xml` (search "EDIT") | Edit, then Theme → Restore in Blogger |
| Change the "Before you share" rules or "Before you join" tips | `assets/syg.js` (`RULES_HTML`, `JOIN_TIPS`) | GitHub → file → ✏️ → Commit |
| Change categories | `assets/syg.js` (`CATS`) **and** `apps-script/Code.gs` (`CATEGORIES`) | ids must match |
| Change blocked words | `apps-script/Code.gs` (`BLOCKED`) | then Deploy → New version |
| Turn the daily random "bump" off | `apps-script/Code.gs` → `BUMP_RANDOM_DAILY: 0` | then run `setup` again |

Changes to `assets/` are live within ~2 minutes (browsers may keep the old copy for up to 10 minutes).

## Sheet columns (after migrateV2)

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| link | timestamp | name | image | category | description | status | checks | last_checked | reports | added | topic |

`topic` = which blog-post list(s) the group belongs to (comma-separated list ids, see Topics.gs).

`status`: `live` (shown) · `pending` (details not read yet, retried hourly) · `dead` (link stopped working) ·
`hidden` (3+ reports) · `rejected` (blocked words) · `duplicate`. To show a row again, set it to `live`.

## AdSense

The theme is built so ads can't break the layout (see section 13 of `syg.css` and `adWatch` in `syg.js`):

| Situation | What the theme does |
|---|---|
| Auto ad dropped inside the group grid or a row | It gets a full row of its own, so cards don't squash |
| Anchor ad (sticky bar on phones, top or bottom) | Header, tab bar, floating buttons, toast and popups move out of its way, and move back when it's closed |
| Ad slot left empty (unfilled) | The empty "sponsored" box folds away; cards fill the space |
| "Full width responsive" ads in cards | Switched off for the card slot, so the ad stays inside its card |
| Ads inside blog posts | Kept inside the post width, no sideways scrolling |

Filled ads are never hidden (that would break AdSense rules); only empty slots fold away.

Recommended AdSense settings (AdSense → Ads → shareyourgroup.com → Edit):
- **Auto ads:** on. **In-page formats:** on. **Anchor ads:** on (the theme makes room for them). **Vignette ads:** your choice.
- **Ad load:** start in the middle. The grid already has a slot every 6 groups.
- **ads.txt:** Blogger adds it for you when AdSense is linked under *Settings → Monetization*.

## Notes
- Scheduled GitHub jobs can pause after 60 days without repo activity. The job commits data often, so this
  should not happen. If groups stop updating, open **Actions** and click **Enable workflow**.
- Not carried over from the old theme: Google Translate widget, floating Ko-fi chat (now a footer link),
  arrow-key banner, pageview counter, popular/featured posts widgets, Disqus recommendations.
- Removed categories: Adult, Hot, Boys, Girls (AdSense risk). Old groups get a category automatically from their name.
