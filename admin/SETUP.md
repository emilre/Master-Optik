# Master Optik — admin panel / CRM

A small CRM for the shop owner, served from the same static GitHub Pages site.
No build step; data lives in a free [Supabase](https://supabase.com) project.

| File | What it is |
|---|---|
| `admin/index.html` | the panel (open it at `/admin/`) |
| `admin/app.js` | the whole application — AZ/RU/EN, ~2 300 lines of vanilla JS |
| `admin/admin.css` | admin design system |
| `admin/schema.sql` | **run this once** in the Supabase SQL editor |
| `admin/guide.html` | the step-by-step setup tutorial (AZ + EN) — start here |
| `assets/mo-config.js` | the two connection values the website needs |
| `assets/mo-site.js` | public-site runtime: Instagram gallery + editable copy |

## Setup in short

1. Create a free Supabase project.
2. SQL Editor → paste all of `admin/schema.sql` → **Run**.
3. Authentication → Users → *Add user* (tick **Auto Confirm User**) — that is the login.
4. Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
5. SQL Editor → put that login on the staff list (this is what actually grants access):

   ```sql
   insert into public.staff (user_id, email)
   select id, email from auth.users where email = 'owner@example.com'
   on conflict (user_id) do nothing;
   ```
6. Project Settings → API → copy **Project URL** and the **anon public** key.
7. Put both into `assets/mo-config.js` and commit.
8. Open `/admin/` and sign in.

Steps 4 and 5 are not optional. The anon key is public, so without them anyone
who reads the website's source could register an account and read every
customer record.

The full version of these steps, with the Instagram token tutorial, is in
**[`admin/guide.html`](guide.html)** — open it in a browser, it has an AZ/EN switch.

To hand the remaining setup to a local Claude Code session, paste
[`admin/LOCAL-SETUP-PROMPT.md`](LOCAL-SETUP-PROMPT.md) — it carries the same
steps plus the verification checklist and the known gotchas.

## What the panel does

- **Dashboard** — sales this month, open orders, ready for pickup, low stock.
- **Customers** — customer cards, prescriptions (OD/OS · SPH/CYL/AXIS/ADD/PD), printable.
- **Orders** — line items, promised date, deposit/balance, status pipeline;
  delivering an order deducts its stock lines automatically (once, logged in `stock_moves`).
- **Stock** — frames/lenses/accessories, quick +/− quantity, low-stock warnings, stock value.
- **Instagram** — pulls posts from the Instagram Graph API, mirrors the images into
  Supabase Storage, and decides which posts the website gallery shows and in what order.
- **Site copy** — edits the website's own `data-i18n` strings in AZ/RU/EN.
- **Settings** — password, JSON backup of every table, connection info.

## Security

Every table has Row Level Security, and the policies check membership of the
`public.staff` table via `public.is_staff()` — being signed in is not enough,
because a Supabase project accepts sign-ups through the public anon key unless
you turn them off.

Anonymous visitors can read **only** `site_content` and non-hidden
`instagram_posts`. Customers, prescriptions, orders, stock and `settings`
(which holds the Instagram token) are reachable only by users on the staff
list. The anon key in `assets/mo-config.js` is a public key and is safe to
commit — the `service_role` key must never be put in this repository.
