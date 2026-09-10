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

-- convenience view: order + computed money + customer name
create or replace view public.orders_view
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

-- staff-only tables: any logged-in user has full access
do $$
declare t text;
begin
  foreach t in array array['customers','prescriptions','products','stock_moves',
                           'orders','order_items','settings']
  loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format($f$create policy staff_all on public.%I
      for all to authenticated using (true) with check (true)$f$, t);
  end loop;
end $$;

-- website copy: everyone may read, only staff may write
drop policy if exists content_read  on public.site_content;
create policy content_read on public.site_content
  for select to anon, authenticated using (true);
drop policy if exists content_write on public.site_content;
create policy content_write on public.site_content
  for all to authenticated using (true) with check (true);

-- instagram: visitors see visible posts only, staff sees and edits everything
drop policy if exists ig_read_public on public.instagram_posts;
create policy ig_read_public on public.instagram_posts
  for select to anon using (hidden = false);
drop policy if exists ig_staff_all on public.instagram_posts;
create policy ig_staff_all on public.instagram_posts
  for all to authenticated using (true) with check (true);

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
      using (bucket_id = 'instagram') with check (bucket_id = 'instagram');
  exception when insufficient_privilege then
    raise notice 'Could not create storage policies here — create them in Dashboard → Storage → instagram → Policies.';
  end;
end $$;

-- =====================================================================
-- SEED: the website copy that is currently hard-coded in the designs.
-- Editing these rows from the admin panel changes the live website.
-- =====================================================================
insert into public.site_content (key, az, ru, en, group_name, sort_order) values
 ('hero_title','Aydın görmə, mükəmməl görünüş','Чёткое зрение, безупречный образ','Clear vision, perfect look','hero',10),
 ('hero_sub','Master Optik — Bakıda eynək satışı, dioptrili linzalar, təmir və fərdi sifariş. Keyfiyyətli çərçivələr və peşəkar xidmət.','Master Optik — продажа очков, диоптрийные линзы, ремонт и индивидуальный заказ в Баку. Качественные оправы и профессиональный сервис.','Master Optik — eyewear, prescription lenses, repairs and custom orders in Baku. Quality frames and professional service.','hero',20),
 ('hero_badge','2015-dən etibarən Bakıda','В Баку с 2015 года','In Baku since 2015','hero',30),
 ('services_title','Xidmətlərimiz','Наши услуги','Our services','services',10),
 ('services_sub','Gözlərinizə lazım olan hər şey bir yerdə','Всё для ваших глаз в одном месте','Everything your eyes need, in one place','services',20),
 ('svc1_t','Eynək satışı','Продажа очков','Eyewear sales','services',30),
 ('svc1_d','Geniş çeşiddə optik və günəş eynəkləri, müasir çərçivələr.','Большой выбор оптических и солнцезащитных очков, современные оправы.','A wide range of optical and sunglasses with modern frames.','services',31),
 ('svc2_t','Dioptrili linzalar','Диоптрийные линзы','Prescription lenses','services',40),
 ('svc2_d','Reseptə uyğun optik linzalar, antirefleks və blue-light örtük.','Линзы по рецепту, антибликовое и blue-light покрытие.','Lenses to prescription with anti-reflective and blue-light coating.','services',41),
 ('svc3_t','Günəş eynəkləri','Солнцезащитные очки','Sunglasses','services',50),
 ('svc3_d','UV qorumalı, orijinal brend günəş eynəkləri.','Оригинальные брендовые очки с UV-защитой.','Genuine branded sunglasses with UV protection.','services',51),
 ('svc4_t','Eynək təmiri','Ремонт очков','Eyewear repair','services',60),
 ('svc4_d','Çərçivə və linza təmiri, vint, burun altlığı və menteşə dəyişimi.','Ремонт оправ и линз, замена винтов, носоупоров и петель.','Frame and lens repair, screw, nose-pad and hinge replacement.','services',61),
 ('svc5_t','Göz yoxlanışı','Проверка зрения','Vision test','services',70),
 ('svc5_d','Görmə itiliyinin ölçülməsi və düzgün linza seçimi.','Измерение остроты зрения и подбор правильных линз.','Visual acuity measurement and correct lens selection.','services',71),
 ('svc6_t','Kontakt linzalar','Контактные линзы','Contact lenses','services',80),
 ('svc6_d','Gündəlik, aylıq və rəngli kontakt linzalar.','Однодневные, месячные и цветные контактные линзы.','Daily, monthly and colored contact lenses.','services',81),
 ('svc7_t','Uşaq eynəkləri','Детские очки','Kids'' eyewear','services',90),
 ('svc7_d','Davamlı və rahat uşaq çərçivələri.','Прочные и удобные детские оправы.','Durable and comfortable frames for children.','services',91),
 ('svc8_t','Fərdi sifariş','Индивидуальный заказ','Custom orders','services',100),
 ('svc8_d','İstədiyiniz model və linzanın fərdi sifarişi.','Индивидуальный заказ нужной модели и линз.','Custom order of the model and lenses you want.','services',101),
 ('gallery_title','Qalereya','Галерея','Gallery','gallery',10),
 ('gallery_sub','Mağazamızdan və işlərimizdən görüntülər','Кадры из нашего магазина и работ','Shots from our store and our work','gallery',20),
 ('reels_title','Videolar','Видео','Videos','gallery',30),
 ('about_title','Haqqımızda','О нас','About us','about',10),
 ('about_p','Master Optik uzun illərdir Bakıda keyfiyyətli optik məhsullar və peşəkar xidmət təqdim edir. Məqsədimiz — hər müştəriyə həm sağlam görmə, həm də zövqlü görünüş qazandırmaqdır. Təcrübəli komandamız düzgün linza və çərçivə seçimində sizə kömək edir.','Master Optik уже много лет предлагает в Баку качественную оптику и профессиональный сервис. Наша цель — обеспечить каждому клиенту и здоровое зрение, и стильный образ. Опытная команда поможет подобрать правильные линзы и оправу.','For many years Master Optik has offered quality optics and professional service in Baku. Our goal is to give every customer both healthy vision and a stylish look. Our experienced team helps you pick the right lenses and frames.','about',20),
 ('contact_title','Əlaqə','Контакты','Contact','contact',10),
 ('hours_v','B.e–Şənbə 10:00–20:00 · Bazar 11:00–18:00','Пн–Сб 10:00–20:00 · Вс 11:00–18:00','Mon–Sat 10:00–20:00 · Sun 11:00–18:00','contact',20),
 ('addr_v','Faiq Yusifov küç. 73, Nərimanov r., Bakı','ул. Фаига Юсифова 73, Наримановский р-н, Баку','73 Faig Yusifov str., Narimanov dist., Baku','contact',30),
 ('footer_tag','Aydın görmə, mükəmməl görünüş','Чёткое зрение, безупречный образ','Clear vision, perfect look','contact',40)
on conflict (key) do nothing;

-- Done. Next: create the owner login under Authentication → Users,
-- then open /admin/ on the website and sign in.
