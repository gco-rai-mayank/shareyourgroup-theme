# WhatsApp group directory theme for Blogger

A Blogger theme that turns a blog into a fast, searchable directory of WhatsApp groups and channels.
Blogger keeps the domain, pages, posts and ads. This repository holds the design, the scripts and a
cached copy of the group list, served for free by GitHub Pages. A Google Sheet with Apps Script is
the database.

For a step-by-step setup, open **[BLOGGER-GUIDE.html](BLOGGER-GUIDE.html)** in a browser.

> **Designed & Developed by [Nivesh Sahayak](https://www.niveshsahayak.in/).**
> This is not open-source. **Ask for permission before you use or distribute any of these files**, and
> keep a visible credit to Nivesh Sahayak with a link to <https://www.niveshsahayak.in/> wherever they
> are used. See [LICENSE](LICENSE).

## How it works

```
Visitor ──opens──▶ Blogger page ──loads──▶ GitHub Pages: syg.css, syg.js, data/groups.json   (instant)
        └──asks──▶ Apps Script ?since=…  ──▶ only groups added after that copy               (~1 s, cached 60 s)
Visitor ──submits a group──▶ Apps Script ──writes──▶ Google Sheet
Apps Script (every 15 min, and soon after a submission) ──starts──▶ GitHub Actions job:
    1. scripts/enrich.mjs     reads each new link's name and photo, sends them back to the Apps Script
    2. scripts/build-data.mjs rebuilds data/groups.json from the Apps Script
    3. publishes the repository to GitHub Pages
```

A new submission shows on the submitter's screen at once, and on everyone else's next page load
(or as a "new groups" button while they browse). Nobody waits for the 15-minute job.

## Files

| Path | What it does |
|---|---|
| `blogger/theme.template.xml` | The Blogger theme with placeholders. Copy it to `blogger/theme.xml`, fill in your values, upload it in Blogger (Theme → Restore). |
| `assets/syg.css` | All styling. Colours and fonts are CSS variables at the top; dark and light themes. |
| `assets/syg.js` | All features: group grid, search, categories, submit form, share panel, report flag, join/rules popups, tour, blog cards, page tools. |
| `assets/brand/` | Logo images and favicons. Replace with your own. |
| `data/groups.json` | The cached group list. Rebuilt by the GitHub job; don't edit by hand. |
| `data/topics/<id>.json` | Smaller lists for blog posts that show their own groups. |
| `apps-script/Code.gs` | The backend: web app (list, submit, report), moderation, link checks, timers. |
| `scripts/enrich.mjs` | Reads group names and photos from WhatsApp invite pages (WhatsApp blocks Google's servers, so GitHub does this). |
| `scripts/build-data.mjs` | Downloads the live list from the Apps Script and writes `data/groups.json`. |
| `scripts/make-theme-template.ps1` | Rebuilds the public template from your private `theme.xml`, swapping every personal value for a placeholder. |
| `.github/workflows/sync-groups.yml` | The job above. Runs when started by the Apps Script, on GitHub's schedule as a backup, and on every push. |

### Kept private

`.gitignore` keeps your own `blogger/theme.xml`, your page texts (`blogger/pages/`), one-time
migration scripts and personal guides out of the repository. Only the template is public.

## Settings

### In `theme.xml` (`window.SYG`, near the end)

| Key | Meaning |
|---|---|
| `dataUrl` | `https://YOUR-GITHUB-USER.github.io/YOUR-REPO/data/groups.json` |
| `apiUrl` | Your Apps Script web app URL (ends in `/exec`) |
| `perPage` | Groups loaded per scroll or per "Show more" (default 24) |
| `adEvery` | An ad or promo card after every N groups (0 = off) |
| `postAdEvery` | The same card after every N articles on blog lists (0 = off) |
| `adClient`, `adSlot` | AdSense publisher id and ad unit id for the card slots. Empty `adSlot` = promo card only |
| `disqus` | Disqus shortname for comments, or empty |
| `siteName` | Shown in share texts and titles |

Search the theme for `EDIT` to find the menu, FAQ, footer links and social links. The footer credit
("Designed & Developed by Nivesh Sahayak") must stay as it is.

### In the Apps Script

| Where | What |
|---|---|
| `CONFIG` in `Code.gs` | Sheet name, reports before a listing is hidden, daily random bump, description length |
| `CATEGORIES` in `Code.gs` | Category ids. Must match `CATS` in `syg.js` |
| `BLOCKED` in `Code.gs` | Words and phrases that get a listing rejected (whole-word match) |
| `GH_REPO` in `Code.gs` | `your-user/your-repo`, so the script can start the GitHub job |
| Script property `ENRICH_TOKEN` | Shared secret for the GitHub job; created by `setupGitHubHelper()` |
| Script property `GITHUB_TOKEN` | Fine-grained GitHub token, this repository only, permission *Actions: Read and write* |

### In GitHub (Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `APPS_SCRIPT_URL` | Your Apps Script web app URL |
| `ENRICH_TOKEN` | The same value as the script property |

GitHub Pages must use **Source: GitHub Actions**.

## Apps Script functions

| Function | When it runs | What it does |
|---|---|---|
| `doGet` | Web requests | Full list, `?since=` new groups, or the job's to-do list |
| `doPost` | Web requests | Submit a group, report a group, save details from the GitHub job |
| `setup` | Once, by you | Removes old timers and installs: `kickGitHub` every 15 min, `repairPending` every 6 h, `recheckLive` daily, `bumpRandom` daily |
| `setupGitHubHelper` | Once, by you | Creates `ENRICH_TOKEN` and prints it |
| `kickGitHub` | Timer, and after submissions | Starts the GitHub job |
| `remoderate` | By you, after editing `BLOCKED` | Re-checks every live group against the blocked words |
| `testFetch` | By you | Debug: reads one invite link and logs the result |

## Sheet columns

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| link | timestamp | name | image | category | description | status | checks | last_checked | reports | added | topic |

`status`: `live` (shown) · `pending` (details not read yet) · `dead` (link stopped working) ·
`hidden` (reached the report limit) · `rejected` (blocked words) · `duplicate`.
Set a row back to `live` to show it again. Rows are never deleted by the scripts.

## Page hooks

Put these in any Blogger page or post (HTML view). The script fills them in.

| Markup | Becomes |
|---|---|
| `<div data-syg="submit"></div>` | The submit form |
| `<div data-syg="contact-form"></div>` | Blogger's contact form gadget |
| `<div data-syg="wa-direct"></div>` | "Message without saving the number" tool |
| `<div data-syg="groups" data-topic="short-name"></div>` | A searchable group list for that post, with its own "Add your group" button |
| `<p class="pg-links">` with Instagram / Facebook / Reddit / WhatsApp / Telegram links | Brand-coloured social cards |

The layout gadget **Promo card between groups** (Blogger → Layout) is the promo shown in the card
slots. Paste any HTML there, including an AdSense `<ins>` unit.

## Ads

The theme is built so ads don't break the layout: auto ads inside the grid get a full row, anchor
ads push the header and floating buttons out of the way, unfilled slots fold away, and card slots
switch off "full width responsive". Filled ads are never hidden.

## Everyday changes

| To change… | Edit | Goes live |
|---|---|---|
| Colours, fonts, layout | `assets/syg.css` | ~2 min after you commit |
| Features, texts in popups, categories | `assets/syg.js` | ~2 min after you commit |
| Menu, FAQ, footer, settings | your `theme.xml` | Blogger → Theme → Restore |
| Blocked words, moderation | `Code.gs` | Apps Script → Deploy → Manage deployments → edit → New version |

After changing your `theme.xml`, run `scripts/make-theme-template.ps1` so the public template stays current.

## Notes

- GitHub can pause scheduled jobs on quiet repositories. The Apps Script starts the job itself, so
  this doesn't matter; if the list stops updating, open **Actions** and enable the workflow.
- WhatsApp may refuse to answer for a while (HTTP 429). Links it doesn't answer for are retried
  later and are never marked dead because of it.

## Credits and permission

Designed & Developed by **[Nivesh Sahayak](https://www.niveshsahayak.in/)**. © 2026, all rights reserved.

- **Permission first:** contact Nivesh Sahayak through <https://www.niveshsahayak.in/> before using,
  copying, changing or sharing any part of this repository.
- **Credit always:** every permitted use keeps the footer line *Designed & Developed by Nivesh Sahayak*,
  linked to <https://www.niveshsahayak.in/>, and the credit notices at the top of the source files.

Full terms: [LICENSE](LICENSE).
