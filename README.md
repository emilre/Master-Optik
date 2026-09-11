# Master Optik — website

Static site hosted on **GitHub Pages** → https://emilre.github.io/Master-Optik/

No build step. Plain HTML/CSS/vanilla JS. Deploy is automatic: every push to
`claude/github-pages-deploy-e3kwmy` or `main` runs `.github/workflows/deploy-pages.yml`.

## The site

`index.html` is the whole public site: **Vitrin / 4 səhifə** — the design that
was chosen out of the eleven directions (it was `d6`). Four hash-routed pages,
`#/` · `#/xidmetler` · `#/qalereya` · `#/elaqe`, with the dioptre slider on the
hero.

It was authored as a 2.4 MB self-extracting bundle with every photo, font and
script base64'd into one file. It now ships as ordinary files: a 46 KB page,
photos served from `images/`, fonts from `fonts/`, and the renderer — React 18
plus the design runtime — from `vendor/`. Rendering is identical; the bytes are
shared and cached instead of inlined once per visit.

The other ten directions were deleted when this one was picked. They are still
in git history if anyone wants to look back at them.

## Admin panel / CRM (`/admin/`)

A working CRM for the shop owner, on the same static host: **customers &
prescriptions, orders, stock, the showcase gallery, the Instagram feed and the
website copy**.
Data lives in a free Supabase project (Postgres + Auth, Row Level Security).

Start with **[`admin/guide.html`](admin/guide.html)** — a step-by-step setup
tutorial in Azerbaijani and English (Supabase project, database schema, login,
Instagram access token). Short version in [`admin/SETUP.md`](admin/SETUP.md).

| File | Role |
|---|---|
| `admin/index.html` · `app.js` · `admin.css` | the panel itself (AZ / RU / EN) |
| `admin/schema.sql` | run once in the Supabase SQL editor |
| `admin/guide.html` | setup tutorial |
| `assets/mo-config.js` | the two Supabase values the site needs (fill in once) |
| `assets/mo-site.js` | public-site runtime: website copy overrides |

Until `assets/mo-config.js` is filled in, the site keeps working exactly as
before — the runtime silently does nothing.

### Two galleries, deliberately separate

The Qalereya page shows **two** sections, and they are not the same thing:

- **Vitrin** — the shop's own curated photos, managed in the panel under
  *Vitrin*: upload, caption in AZ/RU/EN, reorder, hide. Uploads are resized in
  the browser to 1600px and stored in Supabase Storage.
- **Instagram** — the posts synced from
  [@master__optik](https://instagram.com/master__optik), below the showcase,
  each tile linking to its post. It renders only when there are posts.

Both are rendered by the page itself from `showcase_items` and
`instagram_posts`, inside the design runtime — not injected by a script
afterwards. That matters: the page is React-rendered, and DOM injected from
outside is destroyed the moment the visitor changes route.

The nine photos the site shipped with are seeded into `showcase_items`, so the
panel opens populated and the shop edits from there.

## Structure

| Path | What it is |
|---|---|
| `index.html` | the site — markup plus the design runtime's template syntax |
| `vendor/` | `react` · `react-dom` · `dc-runtime.js`, which renders the page |
| `fonts/` | Nunito, five `woff2` subsets; the browser fetches only what a page uses |
| `images/` | every photo the site shows — replacing a file here changes the site |
| `overlay.js` | shared nav, language switcher, WhatsApp/call buttons; loads the copy runtime |
| `assets/` | `mo-config.js` (Supabase keys) · `mo-site.js` (website copy overrides) |
| `admin/` | the CRM — see above |
| `videos/` | three reels, used by designs that no longer ship; kept as source media |

`index.html` is generated, not hand-written: it is the old `d6` bundle unpacked
into real files. Edit it directly — the bundle is gone, and there is no build
step. The `{{ … }}`, `sc-if` and `ref=` attributes in it are the design
runtime's template syntax and are evaluated in the browser.

## Media slots

| File | Content |
|---|---|
| `images/hero.jpg` | hero photo (subject centered — it gets both portrait and landscape crops) |
| `images/01.jpg` … `09.jpg` | gallery photos (cover-cropped per design; no pre-cropping needed) |
| `images/about.jpg` | about-section photo |
| `images/mekan.jpg` | shop exterior (reserve) |
| `images/reel1.jpg` … `reel3.jpg` | 9:16 poster frames for the reels |
| `videos/reel1.mp4` … `reel3.mp4` | reels (720p, ≤8 MB, H.264 faststart) |

Photos came from Instagram [@master__optik](https://instagram.com/master__optik):
EXIF orientation applied then stripped, progressive JPEG, under 400 KB each.
The home page uses `hero.jpg`, `01`–`09`, `about.jpg`, `mekan.jpg` and
`reel1.jpg` directly — replacing any of those changes it with no other edit.
The Qalereya showcase no longer reads these files by name: it reads
`showcase_items`, which was seeded to point at `01`–`09` and is edited in the
panel from then on. `reel2`/`reel3` and the three `.mp4`s are unused by the
current design and kept only as source material.

## Languages

All pages are trilingual — **AZ (default) / RU / EN** — with a language switcher
in the header and inside the mobile menu. Choice persists in `localStorage`.
Translation is applied by `overlay.js` over the Azerbaijani markup; the shop can
also override the headline copy from the admin panel.

## Logo

`images/logo.svg` — the "mc" eye/lens mark (no wordmark text). Works on light and
dark backgrounds. The "MASTER OPTİK" wordmark, where shown, is live HTML text.

## Contact

Phone / WhatsApp: +994 77 745 19 05 · Faiq Yusifov küç. 73, Nərimanov r., Bakı ·
Instagram: [@master__optik](https://instagram.com/master__optik)
