# Handoff prompt — finish the Master Optik CRM setup locally

Everything below is written to be pasted into a local Claude Code session
(or followed by hand). It needs a machine that can reach `supabase.com` and
a browser you are logged into — the cloud session that built this could not
reach Supabase, which is the only reason this is not already done.

Copy everything between the lines.

---

## PROMPT

You are finishing the setup of a CRM that is already built, reviewed and
deployed. Do not rebuild anything. The remaining work is: create a Supabase
project, run one SQL file into it, create the shop's login, wire two values
into the repo, push, and verify end to end.

### The project

- Repo: `emilre/Master-Optik` — a static site on GitHub Pages, no build step.
- Live: https://emilre.github.io/Master-Optik/
- Pages deploys automatically on push to **`claude/github-pages-deploy-e3kwmy`**
  or `main`. The feature branch is `claude/admin-panel-crm-design-tobud3`;
  both currently point at the same commit.
- The site shows eleven design directions (`/d1/`–`/d11/`) for the client to
  choose between. `/admin/` is a CRM for the shop owner.

Files that matter:

| Path | What it is |
|---|---|
| `admin/schema.sql` | the whole database — run this once, verbatim. Idempotent. |
| `admin/guide.html` | the setup tutorial, AZ + EN, with screenshots-in-words |
| `admin/index.html` · `app.js` · `admin.css` | the panel (AZ/RU/EN) |
| `assets/mo-config.js` | **the two values you are about to fill in** |
| `assets/mo-site.js` | public-site runtime: Instagram gallery + editable copy |

Right now `assets/mo-config.js` has empty strings, so the panel shows a setup
wizard and the public site behaves exactly as it did before. Nothing is broken;
it is just not connected yet.

### Do this

1. **Create the Supabase project.** supabase.com → sign in with GitHub →
   *New project*. Name `master-optik`. Region **Frankfurt (eu-central-1)** —
   closest to Baku. Save the database password somewhere safe. Free tier;
   never add a paid plan, this workload does not need one.

2. **Run the schema.** SQL Editor → *New query* → paste **all** of
   `admin/schema.sql` → Run. Expect `Success`. It is safe to re-run.

3. **Create the shop's login.** Authentication → Users → *Add user* →
   *Create new user*. Tick **Auto Confirm User**. Use the owner's real email.
   Choose a password and record it — this is what gets handed to the client.

4. **Turn off public sign-ups.** Authentication → Sign In / Providers →
   switch **off** "Allow new users to sign up".
   *Do not skip this.* The anon key is served on every page of the public
   site; while sign-ups are open, anyone who reads it can register an account.

5. **Put the login on the staff list.** SQL Editor, with the real address:

   ```sql
   insert into public.staff (user_id, email)
   select id, email from auth.users where email = 'owner@example.com'
   on conflict (user_id) do nothing;
   ```

   Signing in is not the same as being allowed in — every table's RLS policy
   checks `public.is_staff()`. Repeat steps 3 and 5 for each member of staff.

6. **Wire the site to the project.** Project Settings → API. Copy **Project URL**
   and the **anon public** key into `assets/mo-config.js`:

   ```js
   window.MO_CONFIG = {
     SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...'
   };
   ```

   The anon key is a public key and **must** be committed — the site cannot
   work without it, and RLS is what protects the data. The **`service_role`
   key must never be committed, pasted into a chat, or put in this repo.**

7. **Ship it.** Commit, then push to both branches so they stay in sync:

   ```bash
   git push origin HEAD:claude/admin-panel-crm-design-tobud3
   git push origin HEAD:claude/github-pages-deploy-e3kwmy
   ```

   Pages rebuilds in a minute or two.

### Then verify, in this order — do not skip the negative tests

Open `https://emilre.github.io/Master-Optik/admin/`.

1. You get a **sign-in screen**, not the setup wizard. (Wizard = step 6 didn't
   deploy.) Sign in with the step-3 credentials.
2. The four-step welcome tour appears. Complete it. The dashboard shows an
   "İlk addımlar" checklist.
3. **Stock arithmetic — the part most worth testing.** Anbar → add a product
   with qty 5. Sifarişlər → new order → pick that product from stock, qty 2 →
   save. Set the order's status to **Təhvil verilib**. Anbar must now read 3.
   Set the order to **Ləğv edilib** — it must go back to 5.
4. Müştərilər → add a customer → add a prescription → print it (a clean A5
   sheet should open).
5. **Instagram.** Panel → Instagram → paste an access token → Save → Sync now.
   Posts appear. Hide one with the eye button. Open `/d1/` and confirm the
   gallery shows the Instagram posts, the hidden one is absent, and each tile
   links to the post. (Token: `admin/guide.html#instagram` walks through the
   Meta app. The Instagram account must be a **Professional/Business** account.)
6. **Site copy.** Sayt mətnləri → change `hero_title` in AZ → Save → reload
   `/d1/` → the headline changed.
7. **Negative test — anonymous visitors.** In a terminal:

   ```bash
   URL=<project url>; KEY=<anon key>
   # must return [] or an empty result, never customer rows:
   curl -s "$URL/rest/v1/customers?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   # must return the site copy (this one is supposed to work):
   curl -s "$URL/rest/v1/site_content?select=key&limit=3" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   ```

   If the first returns customer data, stop — step 2 or 5 did not apply.
8. **Negative test — sign-ups.** Confirm step 4 held:

   ```bash
   curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"probe@example.com","password":"probe-password-123"}'
   ```

   This must be refused (signups not allowed). If it succeeds, go back to step 4
   and delete the account it just created.

### Things the previous session already knows — don't rediscover them

- **Instagram image URLs expire** after a day or two. The panel tries to mirror
  them into Supabase Storage, but Instagram's CDN sends no CORS header, so
  `stored_url` usually stays null and the gallery depends on the automatic
  daily re-sync (which runs whenever the panel is opened). If gallery images go
  blank, open `/admin/` and press *Sync now*. If every image fails, the site
  falls back to the designer's original photos rather than showing an empty
  gallery — this is deliberate.
- The 60-day Instagram token is refreshed automatically on panel open.
- **Dashboard "Bu ayın satışı"** counts payments recorded against orders
  *created* this month. It is not a payments ledger; money received in
  September against an August order lands in August. Changing that needs a
  payments table — a deliberate open decision, not a bug.
- Stock is deducted by Postgres functions (`deliver_order`,
  `revert_order_stock`, `save_order_items`), not from the browser, because
  PostgREST has no client-side transactions. Do not move that logic back into
  JS.
- `admin/schema.sql` has been executed against Postgres 16 twice in a row and
  its access rules tested for anonymous / signed-in-but-not-staff / owner.

### Worth doing once the client picks a design

The site currently ships **all eleven** designs — 25 MB. `d6`–`d11` are
1.6–2.4 MB each because their photos are base64'd into the HTML; `d1`–`d5` are
56 KB and read from the shared `images/` folder.

Once a design is chosen: delete the other ten (25 MB → ~2 MB), and if the
chosen one is `d6`–`d11`, rewire it to `images/` (2.4 MB → ~60 KB per page
load). That is the single biggest win left, and it matters most for customers
on mobile data.

### Cost

Everything here is free and stays free at this scale: GitHub Pages (1 GB site,
100 GB/month) and Supabase free tier (500 MB database, 1 GB storage). The only
thing that could ever cost money is a custom domain. Do not add a paid plan.

---

## What to hand the client afterwards

- The link: `https://emilre.github.io/Master-Optik/admin/`
- The email and password from step 3, with a note to change it under
  **Ayarlar → Şifrəni dəyiş** on first login.
- Nothing else — the panel explains itself: a four-step tour on first sign-in,
  a first-steps checklist on the dashboard, and a "Bu bölmə nədir?" button on
  every screen. The full tutorial lives at `/admin/guide.html` (AZ + EN).
