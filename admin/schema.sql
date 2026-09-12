-- =====================================================================
-- Master Optik — CRM / admin panel database schema
-- ---------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor →
-- New query → paste → Run). Safe to re-run: everything is idempotent.
--
-- What it creates
--   customers          müştərilər        customer cards
--   prescriptions      reseptlər         eye prescriptions per customer
--   products           anbar             frames / lenses / accessories stock
--   stock_moves        anbar hərəkəti    every +/- change to stock
--   orders             sifarişlər        jobs, with status pipeline
--   order_items        sifariş sətirləri lines of an order
--   site_content       sayt mətnləri     public website copy (AZ/RU/EN)
--   instagram_posts    instagram         synced posts for the site gallery
--   settings           ayarlar           private key/value (IG token etc.)
--
-- Security model
--   anon (website visitors) : READ site_content + visible instagram_posts.
--   authenticated (owner/staff logged into /admin/) : full access.
--   Nobody anonymous can ever read customers, orders, stock or settings.
-- =====================================================================

-- ---------- extensions -----------------------------------------------
create extension if not exists "pgcrypto";

-- ---------- enums -----------------------------------------------------
do $$ begin
  create type order_status as enum
    ('new','ordered','in_lab','ready','delivered','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_category as enum
    ('frame','sunglasses','lens','contact','accessory','solution','other');
exception when duplicate_object then null; end $$;

-- ---------- helper: updated_at ---------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- CUSTOMERS
-- =====================================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  email        text,
  birth_date   date,
  gender       text,
  address      text,
  notes        text,
  tags         text[] default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customers_name_idx  on public.customers using gin (to_tsvector('simple', full_name));
create index if not exists customers_phone_idx on public.customers (phone);
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- PRESCRIPTIONS  (recept)
-- SPH / CYL / AXIS / ADD per eye, plus PD.  OD = right eye, OS = left eye.
-- =====================================================================
create table if not exists public.prescriptions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  issued_on    date not null default current_date,
  doctor       text,
  od_sph numeric(5,2), od_cyl numeric(5,2), od_axis int, od_add numeric(4,2),
  os_sph numeric(5,2), os_cyl numeric(5,2), os_axis int, os_add numeric(4,2),
  pd     numeric(5,1),
  notes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists prescriptions_customer_idx on public.prescriptions (customer_id, issued_on desc);
drop trigger if exists prescriptions_touch on public.prescriptions;
create trigger prescriptions_touch before update on public.prescriptions
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- PRODUCTS  (anbar / stock)
-- =====================================================================
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  sku          text unique,
  category     product_category not null default 'frame',
  brand        text,
  model        text,
  color        text,
  size         text,
  cost_price   numeric(10,2) default 0,
  sale_price   numeric(10,2) default 0,
  qty          int not null default 0,
  min_qty      int not null default 1,
  image_url    text,
  notes        text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists products_search_idx on public.products (brand, model);
create index if not exists products_low_idx    on public.products (qty) where archived = false;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- every stock change is written here, so the owner can audit shrinkage
create table if not exists public.stock_moves (
  id          bigserial primary key,
  product_id  uuid not null references public.products(id) on delete cascade,
  delta       int  not null,
  reason      text,
  order_id    uuid,
  created_at  timestamptz not null default now()
);
create index if not exists stock_moves_product_idx on public.stock_moves (product_id, created_at desc);
-- the delivery guard looks moves up by order; the foreign key is added after
-- public.orders exists, further down
create index if not exists stock_moves_order_idx on public.stock_moves (order_id);

-- =====================================================================
-- ORDERS  (sifarişlər)
-- =====================================================================
create sequence if not exists public.order_code_seq start 1000;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null default ('MO-' || nextval('public.order_code_seq')::text),
  customer_id   uuid references public.customers(id) on delete set null,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  status        order_status not null default 'new',
  promised_on   date,
  delivered_at  timestamptz,
  discount      numeric(10,2) not null default 0,
  paid          numeric(10,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_status_idx   on public.orders (status, created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  qty         int  not null default 1,
  unit_price  numeric(10,2) not null default 0,
  line_total  numeric(12,2) generated always as (qty * unit_price) stored
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- now that public.orders exists, tie the stock ledger to it
do $$ begin
  alter table public.stock_moves
    add constraint stock_moves_order_fk
    foreign key (order_id) references public.orders(id) on delete set null;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- STOCK MOVEMENTS THAT MUST NOT GO HALF-DONE
-- ---------------------------------------------------------------------
-- The browser talks to PostgREST directly and has no transactions, so
-- anything that touches money or stock in more than one step lives here
-- instead. A function body is one transaction: it either all happens or
-- none of it does.
-- =====================================================================

-- Replace an order's lines. Doing this as delete-then-insert from the
-- browser would wipe the lines whenever the insert failed (dropped wifi,
-- expired token) and leave the order looking settled at 0 ₼.
create or replace function public.save_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
as $$
begin
  if not public.is_staff() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items (order_id, product_id, description, qty, unit_price)
  select p_order_id,
         nullif(x->>'product_id', '')::uuid,
         coalesce(nullif(x->>'description', ''), '—'),
         greatest(coalesce((x->>'qty')::int, 1), 1),
         coalesce((x->>'unit_price')::numeric, 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
end $$;

-- Has this order already taken stock out of the warehouse?
-- Net, not existence: an order can be delivered, reverted and delivered
-- again, and each pass must do the right thing.
create or replace function public.order_stock_net(p_order_id uuid)
returns int
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int
    from public.stock_moves where order_id = p_order_id;
$$;

-- Deliver: deduct every line once, aggregated per product (two lines of
-- the same frame must take two off the shelf), never below zero, and log
-- exactly what was applied.
create or replace function public.deliver_order(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  if not public.is_staff() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  update public.orders
     set status = 'delivered', delivered_at = coalesce(delivered_at, now())
   where id = p_order_id;

  if public.order_stock_net(p_order_id) < 0 then
    return;                      -- already deducted
  end if;

  with want as (
    select product_id, sum(qty)::int as qty
      from public.order_items
     where order_id = p_order_id and product_id is not null
     group by product_id
  ),
  calc as (
    -- read the current quantity before the update, so the ledger records
    -- what actually left the shelf rather than what was asked for
    select w.product_id, least(w.qty, p.qty) as applied
      from want w
      join public.products p on p.id = w.product_id
     order by w.product_id            -- stable lock order
       for update of p
  ),
  upd as (
    update public.products p
       set qty = p.qty - c.applied
      from calc c
     where p.id = c.product_id
     returning p.id
  )
  insert into public.stock_moves (product_id, delta, reason, order_id)
  select product_id, -applied, 'order delivered', p_order_id
    from calc where applied > 0;
end $$;

-- Put the stock back: an order that was delivered and is then cancelled,
-- reopened or re-costed must not leave the shelf count short.
create or replace function public.revert_order_stock(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  if not public.is_staff() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if public.order_stock_net(p_order_id) >= 0 then
    return;                      -- nothing is out on this order
  end if;

  with back as (
    select product_id, (-sum(delta))::int as qty
      from public.stock_moves
     where order_id = p_order_id
     group by product_id
    having sum(delta) < 0
  ),
  upd as (
    update public.products p
       set qty = p.qty + b.qty
      from back b
     where p.id = b.product_id
     returning p.id
  )
  insert into public.stock_moves (product_id, delta, reason, order_id)
  select product_id, qty, 'order reverted', p_order_id from back;
end $$;

revoke all on function public.save_order_items(uuid, jsonb)  from public, anon;
revoke all on function public.order_stock_net(uuid)          from public, anon;
revoke all on function public.deliver_order(uuid)            from public, anon;
revoke all on function public.revert_order_stock(uuid)       from public, anon;
grant execute on function public.save_order_items(uuid, jsonb) to authenticated;
grant execute on function public.order_stock_net(uuid)         to authenticated;
grant execute on function public.deliver_order(uuid)           to authenticated;
grant execute on function public.revert_order_stock(uuid)      to authenticated;

-- convenience view: order + computed money + customer name
-- (dropped first: CREATE OR REPLACE VIEW cannot reorder columns, so re-running
--  this file after `orders` gains a column would otherwise abort here)
drop view if exists public.orders_view;
create view public.orders_view
with (security_invoker = on) as
select
  o.*,
  c.full_name as customer_name,
  c.phone     as customer_phone,
  coalesce(i.items_total, 0)                          as items_total,
  coalesce(i.items_total, 0) - o.discount             as total,
  coalesce(i.items_total, 0) - o.discount - o.paid    as balance
from public.orders o
left join public.customers c on c.id = o.customer_id
left join lateral (
  select sum(line_total) as items_total
  from public.order_items oi where oi.order_id = o.id
) i on true;

-- =====================================================================
-- SITE CONTENT  (public website copy, editable from the admin panel)
-- key matches the data-i18n attribute used by the website pages
-- =====================================================================
create table if not exists public.site_content (
  key        text primary key,
  az         text,
  ru         text,
  en         text,
  group_name text default 'general',
  sort_order int  default 100,
  updated_at timestamptz not null default now()
);
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- INSTAGRAM POSTS  (synced from the Instagram Graph API by the admin panel)
-- =====================================================================
create table if not exists public.instagram_posts (
  id            text primary key,           -- Instagram media id
  permalink     text not null,
  media_type    text,                       -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_url     text,                       -- expires — refreshed on each sync
  thumbnail_url text,
  stored_url    text,                       -- permanent copy in Supabase Storage
  caption       text,
  posted_at     timestamptz,
  hidden        boolean not null default false,
  sort_order    int     not null default 0,
  synced_at     timestamptz not null default now()
);
create index if not exists instagram_visible_idx
  on public.instagram_posts (hidden, sort_order, posted_at desc);

-- =====================================================================
-- SETTINGS  (private — Instagram token, shop details, never public)
-- =====================================================================
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- WHO COUNTS AS STAFF
-- ---------------------------------------------------------------------
-- Being logged in is NOT enough. A Supabase project accepts sign-ups
-- through the public anon key by default, so "any authenticated user"
-- would mean "anybody who registers an account" — and this database
-- holds customer names, phone numbers, prescriptions and an Instagram
-- token. Access is therefore granted per user, by this table only.
--
-- After creating the login under Authentication → Users, add it here:
--
--   insert into public.staff (user_id, email)
--   select id, email from auth.users where email = 'owner@example.com'
--   on conflict (user_id) do nothing;
--
-- (Also turn OFF Authentication → Sign In / Providers → "Allow new users
--  to sign up". Both steps are in admin/guide.html.)
-- =====================================================================
create table if not exists public.staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);
alter table public.staff enable row level security;

-- security definer: the check must work even though `staff` is itself
-- protected, and a caller must not be able to see other people's rows.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- a signed-in user may confirm their own membership, nothing more
drop policy if exists staff_self on public.staff;
create policy staff_self on public.staff
  for select to authenticated using (user_id = auth.uid());

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.customers       enable row level security;
alter table public.prescriptions   enable row level security;
alter table public.products        enable row level security;
alter table public.stock_moves     enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.site_content    enable row level security;
alter table public.instagram_posts enable row level security;
alter table public.settings        enable row level security;

-- shop data: readable and writable only by users listed in public.staff
do $$
declare t text;
begin
  foreach t in array array['customers','prescriptions','products','stock_moves',
                           'orders','order_items','settings']
  loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format($f$create policy staff_all on public.%I
      for all to authenticated
      using (public.is_staff()) with check (public.is_staff())$f$, t);
  end loop;
end $$;

-- website copy: everyone may read, only staff may write
drop policy if exists content_read  on public.site_content;
create policy content_read on public.site_content
  for select to anon, authenticated using (true);
drop policy if exists content_write on public.site_content;
create policy content_write on public.site_content
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- instagram: visitors see visible posts only, staff sees and edits everything
drop policy if exists ig_read_public on public.instagram_posts;
create policy ig_read_public on public.instagram_posts
  for select to anon using (hidden = false);
drop policy if exists ig_staff_all on public.instagram_posts;
create policy ig_staff_all on public.instagram_posts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- =====================================================================
-- STORAGE bucket for permanent copies of Instagram images
-- (Instagram media_url links expire after a few days — we mirror them.)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('instagram', 'instagram', true)
on conflict (id) do update set public = true;

do $$
begin
  begin
    drop policy if exists ig_public_read on storage.objects;
    create policy ig_public_read on storage.objects
      for select to anon, authenticated using (bucket_id = 'instagram');
    drop policy if exists ig_staff_write on storage.objects;
    create policy ig_staff_write on storage.objects
      for all to authenticated
      using (bucket_id = 'instagram' and public.is_staff())
      with check (bucket_id = 'instagram' and public.is_staff());
  exception when insufficient_privilege then
    raise notice 'Could not create storage policies here — create them in Dashboard → Storage → instagram → Policies.';
  end;
end $$;

-- =====================================================================
-- SHOWCASE (vitrin) — the shop's own curated gallery.
-- Deliberately separate from instagram_posts: the showcase is what the
-- shop chooses to display, the Instagram feed is what it happens to have
-- posted. The two render as two sections on the Qalereya page.
-- =====================================================================
create table if not exists public.showcase_items (
  id         uuid primary key default gen_random_uuid(),
  image_url  text not null,           -- 'images/01.jpg', or a Storage URL
  caption_az text,
  caption_ru text,
  caption_en text,
  sort_order int     not null default 0,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists showcase_visible_idx
  on public.showcase_items (hidden, sort_order);

drop trigger if exists showcase_touch on public.showcase_items;
create trigger showcase_touch before update on public.showcase_items
  for each row execute function public.touch_updated_at();

alter table public.showcase_items enable row level security;

-- same shape as instagram_posts: visitors see what is not hidden,
-- staff sees and edits everything
drop policy if exists showcase_read_public on public.showcase_items;
create policy showcase_read_public on public.showcase_items
  for select to anon using (hidden = false);
drop policy if exists showcase_staff_all on public.showcase_items;
create policy showcase_staff_all on public.showcase_items
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Storage for showcase uploads, mirroring the instagram bucket.
insert into storage.buckets (id, name, public)
values ('showcase', 'showcase', true)
on conflict (id) do update set public = true;

do $$
begin
  begin
    drop policy if exists showcase_public_read on storage.objects;
    create policy showcase_public_read on storage.objects
      for select to anon, authenticated using (bucket_id = 'showcase');
    drop policy if exists showcase_staff_write on storage.objects;
    create policy showcase_staff_write on storage.objects
      for all to authenticated
      using (bucket_id = 'showcase' and public.is_staff())
      with check (bucket_id = 'showcase' and public.is_staff());
  exception when insufficient_privilege then
    raise notice 'Could not create storage policies here - create them in Dashboard > Storage > showcase > Policies.';
  end;
end $$;

-- SEED: the nine photos the site shipped with, so the panel opens already
-- populated. Only runs while the table is empty, so it never fights the
-- shop's own edits. The files stay in images/ until they are replaced.
insert into public.showcase_items (image_url, caption_az, sort_order)
select * from (values
  ('images/01.jpg', 'mağaza vitrini',        10),
  ('images/02.jpg', 'optik çərçivə portret', 20),
  ('images/03.jpg', 'günəş eynəyi',          30),
  ('images/04.jpg', 'təmir prosesi',         40),
  ('images/05.jpg', 'linza kəsimi',          50),
  ('images/06.jpg', 'uşaq eynəyi',           60),
  ('images/07.jpg', 'çərçivə rəfi',          70),
  ('images/08.jpg', 'usta işi',              80),
  ('images/09.jpg', 'mağaza interyeri',      90)
) as v(image_url, caption_az, sort_order)
where not exists (select 1 from public.showcase_items);

-- =====================================================================
-- SEED: the website copy, exactly as the page shows it, in all three
-- languages. Editing these rows from the admin panel changes the live
-- website: every one of them is tagged with data-i18n in index.html and
-- applied by assets/mo-site.js.
--
-- Only seeds an empty table, so re-running this file never overwrites
-- what the shop has written.
-- =====================================================================
insert into public.site_content (key, az, ru, en, group_name, sort_order)
select * from (values
 ('hero_sub','Satış, təmir və fərdi sifariş. Gəlin, rahat-rahat seçin — hansı çərçivənin sizə yaraşdığını yerində göstərək.','Продажа, ремонт и индивидуальный заказ. Приходите и выбирайте спокойно — на месте покажем, какая оправа вам идёт.','Sales, repairs and custom orders. Come choose at ease — we will show you which frame suits you.','hero',10),
 ('home_vit_t','Vitrinimiz','Наша витрина','Our showcase','hero',20),
 ('home_vit_p','Siyahı mağazadakı rəflərdən götürülüb — dəyişməli brend varsa deyin.','Список взят с полок магазина — скажите, если какой-то бренд нужно заменить.','The list comes from our store shelves — tell us if a brand should change.','hero',30),
 ('home_svc_t','Xidmətlər','Услуги','Services','hero',40),
 ('home_svc_p','Satış, linza, təmir, fərdi sifariş — altı iş bir ünvanda.','Продажа, линзы, ремонт, индивидуальный заказ — шесть услуг по одному адресу.','Sales, lenses, repairs, custom orders — six services at one address.','hero',50),
 ('home_gal_t','Qalereya','Галерея','Gallery','hero',60),
 ('home_gal_p','Mağazadan və işlərimizdən şəkillər.','Фотографии магазина и наших работ.','Photos of the store and our work.','hero',70),
 ('home_addr_t','Ünvan və saatlar','Адрес и часы','Address & hours','hero',80),
 ('home_addr_p','Faiq Yusifov küç. 73, N.Nərimanov, Bakı.','ул. Фаига Юсифова 73, Нариманов, Баку.','73 Faig Yusifov str., Narimanov, Baku.','hero',90),
 ('svc_title','Nə edirik?','Что мы делаем?','What we do','services',100),
 ('svc_sub','Altı iş — hamısı bir ünvanda.','Шесть услуг — всё по одному адресу.','Six services — all at one address.','services',110),
 ('svc1_t','Günəş eynəkləri','Солнцезащитные очки','Sunglasses','services',120),
 ('svc1_d','UV qorumalı modellər, brend və büdcə variantları. Yerində sınayıb seçin.','Модели с UV-защитой, брендовые и бюджетные варианты. Примерьте и выберите на месте.','UV-protected models, brand and budget options. Try and choose in store.','services',130),
 ('svc2_t','Optik çərçivələr','Оптические оправы','Optical frames','services',140),
 ('svc2_d','Metal, asetat və titan çərçivələr. Üz formanıza uyğun ölçü seçirik.','Оправы из металла, ацетата и титана. Подберём размер под форму вашего лица.','Metal, acetate and titanium frames. We match the size to your face shape.','services',150),
 ('svc3_t','Linzalar','Линзы','Lenses','services',160),
 ('svc3_d','Antirefleks, blue-cut, fotoxrom və proqressiv linzalar reseptə uyğun hazırlanır.','Антибликовые, blue-cut, фотохромные и прогрессивные линзы изготавливаются по рецепту.','Anti-reflective, blue-cut, photochromic and progressive lenses made to prescription.','services',170),
 ('svc4_t','Təmir','Ремонт','Repairs','services',180),
 ('svc4_d','Qırılmış çərçivə, vint, menteşə və burun yastıqcalarının bərpası — çox hallarda eyni gün.','Ремонт сломанных оправ, винтов, петель и носоупоров — чаще всего в тот же день.','Repair of broken frames, screws, hinges and nose pads — usually same day.','services',190),
 ('svc5_t','Fərdi sifariş','Индивидуальный заказ','Custom orders','services',200),
 ('svc5_d','Axtardığınız model mağazada yoxdursa, sizin üçün sifariş edirik.','Если нужной модели нет в магазине, закажем её для вас.','If the model you want isn''t in store, we''ll order it for you.','services',210),
 ('svc6_t','Mağazada seçim','Выбор в магазине','In-store selection','services',220),
 ('svc6_d','Gəlin, taxıb baxın. Ustamız ölçü və oturuşu yerində tənzimləyir.','Приходите и примерьте. Мастер на месте подгонит размер и посадку.','Come try them on. Our master adjusts size and fit on the spot.','services',230),
 ('gal_title','Qalereya','Галерея','Gallery','gallery',240),
 ('gal_sub','Mağazadan, çərçivələrdən və işlərimizdən.','Магазин, оправы и наши работы.','The store, frames and our work.','gallery',250),
 ('ig_title','Instagram-da','В Instagram','On Instagram','gallery',260),
 ('ig_sub','Ən son paylaşımlarımız.','Наши последние публикации.','Our latest posts.','gallery',270),
 ('con_title','Bizə gəlin','Приходите к нам','Visit us','contact',280),
 ('con_sub','N.Nərimanov rayonu, metrodan yaxın.','Наримановский район, рядом с метро.','Narimanov district, near the metro.','contact',290),
 ('con_phone_t','Əlaqə','Контакты','Contact','contact',300),
 ('con_phone_p','Zəng və WhatsApp','Звонок и WhatsApp','Call & WhatsApp','contact',310),
 ('con_hours_t','İş saatları','Часы работы','Opening hours','contact',320),
 ('con_hours_p','Təmir və sifariş üçün əvvəlcədən zəng etmək tövsiyə olunur.','Для ремонта и заказа рекомендуем позвонить заранее.','For repairs and orders, calling ahead is recommended.','contact',330)
) as v(key, az, ru, en, group_name, sort_order)
where not exists (select 1 from public.site_content);

-- =====================================================================
-- WHAT TO DO NEXT — the panel will not open until all three are done
-- =====================================================================
--  1. Authentication → Users → Add user → Create new user
--     (tick "Auto Confirm User"). This is the shop's login.
--
--  2. Authentication → Sign In / Providers → turn OFF
--     "Allow new users to sign up".
--     Without this, anyone who reads the site's public anon key can
--     register an account for themselves.
--
--  3. Grant that login access — SQL Editor, with the real address:
--
--        insert into public.staff (user_id, email)
--        select id, email from auth.users where email = 'owner@example.com'
--        on conflict (user_id) do nothing;
--
--     Repeat step 1 + 3 for every member of staff.
--
-- Then open /admin/ on the website and sign in.
-- =====================================================================
