# Master Optik — website

Static site hosted on **GitHub Pages** → https://emilre.github.io/Master-Optik/

No build step. Plain HTML/CSS/vanilla JS. Deploy is automatic: every push to
`claude/github-pages-deploy-e3kwmy` runs `.github/workflows/deploy-pages.yml`.

## Structure

| Path | What |
|---|---|
| `/` (`index.html`) | Landing page — pick one of the five design directions |
| `/d1/` | **Warm Boutique Minimal** — cream, airy, understated |
| `/d2/` | **Dark Luxe / Premium** — dark, cinematic, glassmorphism |
| `/d3/` | **Bold Editorial / Swiss** — big type, high-contrast grid |
| `/d4/` | **Vibrant Gradient / Friendly** — colorful, rounded, energetic |
| `/d5/` | **Clinical Trust / Optometry** — clean, professional, trust cues |
| `/original/` | The first single-file React version (kept for reference) |
| `images/` | Shared images + `logo.svg` |
| `videos/` | Shared reel videos |

Every design (d1–d5) is a self-contained `index.html` that reads photos/videos
from the shared `images/` and `videos/` folders — so adding media fills **all**
designs at once.

## Languages

All five directions are trilingual — **AZ (default) / RU / EN** — with a language
switcher in the header. Choice persists in `localStorage`. Copy lives in a
`const I18N` object inside each page; keep the three languages in sync when editing.

## Logo

`images/logo.svg` — the "mc" eye/lens mark (no wordmark text). Works on light and
dark backgrounds. The "MASTER OPTİK" wordmark, where shown, is live HTML text.

## Adding photos & reels (from Instagram @master__optik)

Media isn't in the repo yet — the pages show branded placeholders until it is.
Instagram can't be reached from CI, so download on a machine where you're logged in:

```
pip install instaloader
instaloader --login <IG_USERNAME> --highlights --stories --reels master__optik
```

Then drop the files into the shared folders with these names and push:

| File | Content |
|---|---|
| `images/hero.jpg` | main hero / storefront |
| `images/01.jpg` … `images/09.jpg` | gallery photos |
| `images/mekan.jpg` | shop exterior |
| `videos/reel1.mp4` … `reel3.mp4` | reels (≤8 MB, 720p) |

## Contact

Phone / WhatsApp: +994 77 745 19 05 · Faiq Yusifov küç. 73, Nərimanov r., Bakı ·
Instagram: [@master__optik](https://instagram.com/master__optik)
