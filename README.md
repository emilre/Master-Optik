# Master Optik — website

Static site hosted on **GitHub Pages** → https://emilre.github.io/Master-Optik/

No build step. Plain HTML/CSS/vanilla JS. Deploy is automatic: every push to
`claude/github-pages-deploy-e3kwmy` or `main` runs `.github/workflows/deploy-pages.yml`.

## Structure

The landing page (`index.html`) lists all eleven design directions, numbered in
display order (badge → folder):

| # | Path | Design |
|---|---|---|
| 01 | `/d6/` | **Vitrin / 4 səhifə** — four-page full site, showcase boards |
| 02 | `/d7/` | **Gecə Neon** — night indigo & amber, sunglasses energy |
| 03 | `/d8/` | **Riso Kağız** — print style: paper, red/blue ink, serifs |
| 04 | `/d9/` | **Zümrüd** — emerald, bone & copper, quiet luxury |
| 05 | `/d10/` | **Brutal Narıncı** — white, heavy black rules, big orange |
| 06 | `/d11/` | **Pastel Lilac** — lilac/mint, soft, youthful |
| 07 | `/d1/` | **Warm Boutique Minimal** — cream, airy, understated |
| 08 | `/d2/` | **Elegant Serif Luxe** — light ivory, serif, champagne/gold |
| 09 | `/d3/` | **Bold Editorial / Swiss** — big type, high-contrast grid |
| 10 | `/d4/` | **Vibrant Gradient / Friendly** — colorful, rounded, energetic |
| 11 | `/d5/` | **Clinical Trust / Optometry** — clean, professional, trust cues |

`d1`–`d5` read photos/videos from the shared `images/` and `videos/` folders —
replacing a file there updates all five at once. `d6`–`d11` are fully
self-contained: their photos are embedded in the HTML (1.6–2.3 MB per page), so
they need nothing from `images/` (they can be rewired to the shared folder to
slim each page to ~60 KB if wanted).

## Shared media slots (`d1`–`d5` + landing)

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
If a file is missing, `d1`–`d5` fall back to a branded placeholder tile.

## Languages

All pages are trilingual — **AZ (default) / RU / EN** — with a language switcher
in the header (and inside the mobile menu on `d1`–`d5`). Choice persists in
`localStorage`. Copy lives in a `const I18N` object inside each page; keep the
three languages in sync when editing.

## Logo

`images/logo.svg` — the "mc" eye/lens mark (no wordmark text). Works on light and
dark backgrounds. The "MASTER OPTİK" wordmark, where shown, is live HTML text.

## Contact

Phone / WhatsApp: +994 77 745 19 05 · Faiq Yusifov küç. 73, Nərimanov r., Bakı ·
Instagram: [@master__optik](https://instagram.com/master__optik)
