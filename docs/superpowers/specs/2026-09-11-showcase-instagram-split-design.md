# Showcase and Instagram as two sections

**Date:** 2026-09-11
**Status:** implemented and deployed

## Problem

`assets/mo-site.js` finds the design's gallery grid by heuristic, clones its
first tile as a template, wipes the grid and refills it with Instagram posts.
The shop's curated showcase is therefore *destroyed* the moment posts sync —
there is one gallery, not two. Emil wants the витрина (curated showcase) and
the Instagram feed as separate sections, and wants the showcase editable from
the admin panel rather than by replacing files in the repo.

## Decisions

| Question | Decision |
|---|---|
| Where does the Instagram feed live | Below the showcase on `#/qalereya`. No new nav item. |
| Is the showcase panel-editable | Yes — uploads to Supabase Storage, managed in the panel. |
| What does a showcase item carry | Photo, caption in AZ/RU/EN, sort order, hidden flag. |
| Empty states | Seed the database with the 9 current photos, so the panel opens populated. |
| Rendering | Natively in the design runtime (`sc-for`), not by DOM surgery. |

## Two bugs this fixes

Both confirmed by experiment, not inferred:

1. **Instagram posts do not survive route changes.** The page is React-rendered
   through `sc-if` blocks; navigating away from `#/qalereya` and back unmounts
   and remounts the block, destroying anything a script injected. `renderGallery`
   guards with a `data-ig-rendered` attribute, but that attribute dies with the
   node and nothing re-runs the render. Posts silently revert to the designer's
   photos.
2. **All 13 photos load eagerly on the home route** (1518 KB of a 2049 KB first
   load). `loading="lazy"` on templated images cuts this.

## Constraint: the preload scanner

`<img src="{{ t.src }}">` makes the browser request the *literal* string
`/{{ t.src }}` before the runtime substitutes it — one 404 per templated image.
Measured:

| Markup | Leaks a placeholder request |
|---|---|
| `<img src="{{ }}">` | yes |
| `<img src="{{ }}" loading="lazy">` | no |
| `style="background-image:url('{{ }}')"` | no |

**Every templated `<img>` must carry `loading="lazy"`.** This is load-bearing,
not a performance nicety.

## Data model

```sql
create table public.showcase_items (
  id         uuid primary key default gen_random_uuid(),
  image_url  text not null,          -- 'images/01.jpg', or a Storage public URL
  caption_az text,
  caption_ru text,
  caption_en text,
  sort_order int  not null default 0,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `image_url` holds either a repo-relative path (seeded rows) or an absolute
  Storage URL (uploads). Render rule: starts with `http` → use as-is, else treat
  as relative to the site root.
- Caption fallback at render time: `caption_<lang> || caption_az`. Seeded rows
  carry Azerbaijani only.
- RLS mirrors `instagram_posts`: public `select` where `not hidden`, staff
  everything, via `public.is_staff()`.
- Storage bucket `showcase`, public read + staff write, copying the policies the
  `instagram` bucket already uses.

## Seeding

A migration inserts the nine tiles currently hard-coded in `index.html`, with
their existing Azerbaijani captions and `image_url` of `images/01.jpg` …
`images/09.jpg`. Those files stay in the repo and keep working until the shop
replaces them from the panel.

## Public rendering

`index.html`'s script is a plain React class (`class Component extends DCLogic`)
whose `renderVals()` feeds the template. Extend it:

- Initial state holds the nine current tiles, so first paint is correct even if
  Supabase is unreachable or slow.
- `componentDidMount` fetches `showcase_items` and `instagram_posts` in parallel
  over PostgREST and replaces that state. A failed fetch leaves the initial
  state alone.
- `renderVals()` exposes `showcase` and `igPosts`.

Template, inside the existing `sc-if value="{{ isGallery }}"` block:

- the existing grid becomes `<sc-for list="{{ showcase }}" as="t">`
- a sibling block, wrapped in `<sc-if value="{{ igPosts.length }}">`, renders the
  Instagram grid with its own heading and a link to the profile

Because React owns both grids, route changes re-render them correctly with no
observers, no re-render hooks and no flicker.

## `assets/mo-site.js`

Loses the gallery job entirely — `findGrid`, `renderGallery`, `buildTile`,
`decorate`, `injectStyles` and the all-tiles-failed fallback (~180 lines). Keeps
the copy-override job (`site_content` over `[data-i18n]`). The Instagram badge
and play-glyph styling moves into the template's own markup.

## Admin panel

A new **Vitrin** section beside Instagram:

- upload a photo — resized client-side before upload (longest edge 1600px,
  JPEG q0.82) so Storage stays small and pages stay light
- three caption fields (AZ / RU / EN)
- reorder, hide/show, delete

## Error handling

| Case | Behaviour |
|---|---|
| Supabase unreachable | initial hard-coded tiles remain; page looks correct |
| `showcase_items` empty | showcase section renders nothing; page keeps heading |
| `instagram_posts` empty | Instagram block does not render at all |
| A Storage image 404s | that tile is dropped at render |
| Instagram `media_url` expired | unchanged — `stored_url` preferred, daily re-sync |

## Testing

Playwright, against the built site:

1. both grids render, with the right counts
2. **navigate away from `#/qalereya` and back — both grids still populated**
   (regression test for bug 1)
3. no request URL contains a `{{` placeholder
4. no console errors, no broken images, no horizontal overflow at 390px
5. anonymous callers can read `showcase_items` but cannot insert or update it
6. a row hidden in the panel disappears from the public page

## Out of scope

- The Instagram access token itself (needs a Meta app; deferred).
- Reordering the showcase by drag on touch devices beyond basic up/down controls.
