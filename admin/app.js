/* =====================================================================
   Master Optik — admin panel / CRM
   Vanilla JS single-page app on top of Supabase (Postgres + Auth).
   No build step: this file is served as-is by GitHub Pages.

   Sections
     1  helpers, formatting
     2  i18n (AZ / RU / EN)
     3  icons
     4  state + Supabase connection
     5  toasts, modals
     6  setup wizard + login
     7  app shell + router
     8  dashboard
     9  customers + prescriptions
    10  orders
    11  stock
    12  instagram
    13  site content
    14  settings
   ===================================================================== */
(function () {
'use strict';

/* =====================================================================
   1. HELPERS
   ===================================================================== */
var $  = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
};

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------------------------------------------------------------------
   Locale-aware formatting.

   V8 ships no Azerbaijani locale data: Chrome and Edge accept "az-AZ",
   resolve it, then format from ICU root — so toLocaleString returns the
   English "3,090.00" and a long month comes back as the literal "M09".
   Azerbaijani is therefore assembled from an en-US skeleton with CLDR's
   az separators substituted by part type (group ".", decimal ",").
   Ported from the jt codebase (frontend/src/utils/formatNumber.js,
   formatDate.js, formatPhone.js) and rewritten for this build-free panel.
   --------------------------------------------------------------------- */
var LOCALE_TAGS = { az: 'en-US', ru: 'ru-RU', en: 'en-GB' };
var AZ_SEPARATOR = { group: '.', decimal: ',' };
var TZ = 'Asia/Baku';

function formatNumber(value, options) {
  if (value == null || isNaN(Number(value))) return '—';
  try {
    var fmt = new Intl.NumberFormat(LOCALE_TAGS[lang] || LOCALE_TAGS.en, options);
    if (lang !== 'az') return fmt.format(Number(value));
    return fmt.formatToParts(Number(value)).map(function (part) {
      return AZ_SEPARATOR[part.type] != null ? AZ_SEPARATOR[part.type] : part.value;
    }).join('');
  } catch (e) {
    return String(value);
  }
}

function money(v) {
  return formatNumber(Number(v || 0),
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼';
}

function num(v) { return Number(v || 0); }

/* Baku time, whatever timezone the shop's laptop happens to be set to. */
function bakuParts(value) {
  if (!value) return null;
  var d = new Date(value);
  if (isNaN(d.getTime()) && typeof value === 'string') d = new Date(value.replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  try {
    var out = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
    return out;
  } catch (e) {
    return { day: ('0' + d.getDate()).slice(-2), month: ('0' + (d.getMonth() + 1)).slice(-2),
             year: String(d.getFullYear()), hour: ('0' + d.getHours()).slice(-2),
             minute: ('0' + d.getMinutes()).slice(-2) };
  }
}

/* 07.09.2026 reads correctly in all three languages. */
function fmtDate(v) {
  var p = bakuParts(v);
  return p ? p.day + '.' + p.month + '.' + p.year : '—';
}

function fmtDateTime(v) {
  var p = bakuParts(v);
  return p ? p.day + '.' + p.month + '.' + p.year + ' ' + p.hour + ':' + p.minute : '—';
}

/* Phone numbers are stored however staff typed them; show one canonical
   shape (+994 50 312 44 08) and dial them digits-only. */
function phoneDigits(raw) {
  var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (digits.indexOf('00994') === 0) return '994' + digits.slice(5);
  if (digits.indexOf('994') === 0) return digits;
  if (digits.indexOf('0') === 0) return '994' + digits.slice(1);
  if (digits.length === 9) return '994' + digits;
  return digits;
}

function formatPhone(raw) {
  if (raw == null || raw === '') return '';
  var nat = phoneDigits(raw);
  if (nat.indexOf('994') === 0) nat = nat.slice(3);
  if (nat.length !== 9) return String(raw);
  return '+994 ' + nat.slice(0, 2) + ' ' + nat.slice(2, 5) + ' ' +
         nat.slice(5, 7) + ' ' + nat.slice(7, 9);
}

function today() {
  var p = bakuParts(new Date());
  return p ? p.year + '-' + p.month + '-' + p.day : new Date().toISOString().slice(0, 10);
}

function monthStart() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + 'T00:00:00');
  var n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((d - n) / 86400000);
}

function initials(text) {
  var parts = String(text || '?').trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
  };
}

/* format a prescription number the way opticians write it: +1.25 / -0.50 */
function dpt(v) {
  if (v === null || v === undefined || v === '') return '—';
  var n = Number(v);
  if (isNaN(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(2);
}

/* =====================================================================
   2. I18N — the panel speaks the three languages the shop speaks
   ===================================================================== */
var T = {
az: {
  /* generic */
  save:'Yadda saxla', cancel:'Ləğv et', del:'Sil', edit:'Redaktə', add:'Əlavə et',
  search:'Axtar', close:'Bağla', back:'Geri', loading:'Yüklənir…', none:'—',
  all:'Hamısı', total:'Cəmi', actions:'Əməliyyat', notes:'Qeyd', phone:'Telefon',
  name:'Ad', date:'Tarix', status:'Status', price:'Qiymət', qty:'Say', print:'Çap et',
  refresh:'Yenilə', saved:'Yadda saxlanıldı', deleted:'Silindi', err:'Xəta baş verdi',
  required:'Bu sahə vacibdir', sign_out:'Çıxış', today:'Bu gün', open:'Aç',
  confirm_del:'Silinsin? Bu əməliyyat geri qaytarılmır.', nothing:'Hələ məlumat yoxdur',
  email:'E-poçt', password:'Şifrə', optional:'istəyə bağlı', apply:'Tətbiq et',
  /* nav */
  nav_dash:'İdarə paneli', nav_customers:'Müştərilər', nav_orders:'Sifarişlər',
  nav_stock:'Anbar', nav_instagram:'Instagram', nav_content:'Sayt mətnləri',
  nav_settings:'Ayarlar', nav_work:'İş', nav_site:'Sayt',
  /* dashboard */
  dash_hi:'Xoş gəldiniz', dash_rev:'Bu ayın satışı', dash_open:'Açıq sifarişlər',
  dash_ready:'Hazır — təhvil gözləyir', dash_low:'Anbarda azalıb',
  dash_recent:'Son sifarişlər', dash_readyl:'Götürülməyi gözləyir',
  dash_lowl:'Tez bitəcək mallar', dash_all:'Hamısına bax', dash_paid:'ödənilib',
  dash_due:'qalıq', dash_stockval:'Anbarın dəyəri', dash_customers:'Müştəri sayı',
  dash_late:'Vaxtı keçib', dash_pieces:'ədəd',
  /* customers */
  cus_title:'Müştərilər', cus_new:'Yeni müştəri', cus_search:'Ad və ya telefon üzrə axtar…',
  cus_name:'Ad, soyad', cus_birth:'Doğum tarixi', cus_gender:'Cins', cus_addr:'Ünvan',
  cus_none:'Müştəri tapılmadı', cus_since:'Qeydiyyat', cus_rx:'Reseptlər',
  cus_orders:'Sifarişlər', cus_addrx:'Resept əlavə et', cus_card:'Müştəri kartı',
  cus_lastrx:'Son resept', cus_count:'müştəri',
  g_male:'Kişi', g_female:'Qadın',
  /* prescriptions */
  rx_title:'Resept', rx_issued:'Verilib', rx_doctor:'Həkim', rx_od:'Sağ (OD)',
  rx_os:'Sol (OS)', rx_sph:'SPH', rx_cyl:'CYL', rx_axis:'AXIS', rx_add:'ADD',
  rx_pd:'PD (mm)', rx_none:'Resept yoxdur', rx_new:'Yeni resept',
  /* orders */
  ord_title:'Sifarişlər', ord_new:'Yeni sifariş', ord_code:'Nömrə',
  ord_customer:'Müştəri', ord_promised:'Vədə', ord_items:'Sifariş sətirləri',
  ord_desc:'Təsvir', ord_unit:'Vahid qiyməti', ord_disc:'Endirim', ord_paid:'Ödənilib',
  ord_balance:'Qalıq', ord_additem:'Sətir əlavə et', ord_pick:'Anbardan seç',
  ord_none:'Sifariş yoxdur', ord_search:'Nömrə və ya müştəri üzrə axtar…',
  ord_deliver:'Təhvil verildi', ord_pickcus:'Müştəri seçin', ord_rx:'Resept',
  ord_stockmsg:'Anbardan seçilən mallar təhvil zamanı silinir.',
  st_new:'Yeni', st_ordered:'Sifariş verilib', st_in_lab:'Laboratoriyada',
  st_ready:'Hazır', st_delivered:'Təhvil verilib', st_cancelled:'Ləğv edilib',
  /* stock */
  stk_title:'Anbar', stk_new:'Yeni mal', stk_sku:'Kod (SKU)', stk_cat:'Kateqoriya',
  stk_brand:'Brend', stk_model:'Model', stk_color:'Rəng', stk_size:'Ölçü',
  stk_cost:'Maya dəyəri', stk_sale:'Satış qiyməti', stk_min:'Minimum say',
  stk_low:'Yalnız azalanlar', stk_none:'Mal yoxdur', stk_search:'Brend, model və ya kod…',
  stk_value:'Anbarın satış dəyəri', stk_adjust:'Sayı dəyiş', stk_in:'Mal gəldi',
  stk_out:'Mal çıxdı', stk_lowbadge:'Azalıb', stk_archived:'Arxivdə',
  stk_archive:'Arxivlə', stk_unarchive:'Arxivdən çıxar', stk_reason:'Səbəb',
  stk_history:'Hərəkət tarixçəsi', stk_image:'Şəkil linki',
  cat_frame:'Çərçivə', cat_sunglasses:'Günəş eynəyi', cat_lens:'Linza',
  cat_contact:'Kontakt linza', cat_accessory:'Aksesuar', cat_solution:'Məhlul',
  cat_other:'Digər',
  /* instagram */
  ig_title:'Instagram qalereyası', ig_desc:'Saytdakı qalereya yalnız burada görünən Instagram paylaşımlarını göstərir.',
  ig_connect:'Instagram-ı qoşun', ig_token:'Access token', ig_sync:'İndi sinxronlaşdır',
  ig_syncing:'Sinxronlaşdırılır…', ig_last:'Son sinxronizasiya', ig_never:'heç vaxt',
  ig_hide:'Gizlət', ig_show:'Göstər', ig_up:'Yuxarı', ig_down:'Aşağı',
  ig_none:'Hələ paylaşım yoxdur — token əlavə edib sinxronlaşdırın.',
  ig_howto:'Token necə alınır? (addım-addım təlimat)', ig_saved:'Token yadda saxlanıldı',
  ig_got:'paylaşım gətirildi', ig_hidden:'Gizli', ig_video:'Video', ig_album:'Albom',
  ig_mirror:'Şəkillərin daimi surəti saxlanılır…', ig_tokenmiss:'Əvvəlcə access token əlavə edin.',
  ig_expiry:'Token 60 gün etibarlıdır — panel hər açılışda avtomatik uzadır.',
  ig_visible:'saytda görünür', ig_manual:'Əl ilə import',
  ig_manual_d:'Brauzer Instagram-a birbaşa müraciəti bloklayırsa: aşağıdakı linki yeni tabda açın, açılan JSON mətnini kopyalayıb bura yapışdırın.',
  ig_openlink:'Linki aç', ig_paste:'JSON mətni', ig_import:'Import et',
  ig_autosync:'Panel açılanda paylaşımlar avtomatik yenilənir (gündə bir dəfə).',
  /* content */
  cnt_title:'Sayt mətnləri', cnt_desc:'Burada dəyişdirdiyiniz mətnlər saytda dərhal görünür (səhifə yenilənəndən sonra).',
  cnt_hero:'Baş ekran', cnt_services:'Xidmətlər', cnt_gallery:'Qalereya',
  cnt_about:'Haqqımızda', cnt_contact:'Əlaqə', cnt_general:'Ümumi',
  cnt_saveall:'Hamısını yadda saxla', cnt_changed:'dəyişiklik',
  /* settings */
  set_title:'Ayarlar', set_conn:'Verilənlər bazası bağlantısı', set_url:'Layihə URL',
  set_key:'Anon açar', set_acc:'Hesab', set_pw:'Şifrəni dəyiş', set_newpw:'Yeni şifrə',
  set_backup:'Ehtiyat nüsxə', set_backupd:'Bütün məlumatları JSON faylı kimi yükləyin. Ayda bir dəfə tövsiyə olunur.',
  set_download:'Yüklə', set_docs:'Sənədləşmə', set_disconnect:'Bağlantını sıfırla',
  set_pwshort:'Şifrə ən azı 6 simvol olmalıdır', set_tour:'Təlimatı yenidən göstər',
  /* setup + login */
  setup_title:'Quraşdırma', setup_desc:'Panel hələ verilənlər bazasına qoşulmayıb. Supabase layihənizin məlumatlarını daxil edin.',
  setup_help:'Addım-addım quraşdırma bələdçisi',
  setup_connect:'Qoşul', login_title:'İdarə paneli', login_sub:'Master Optik — daxil olun',
  login_btn:'Daxil ol', login_bad:'E-poçt və ya şifrə yanlışdır',
  login_forgot:'Şifrəni unutmusunuz?', login_sent:'Bərpa linki e-poçtunuza göndərildi',
  noacc_t:'Bu hesaba icazə verilməyib', noacc_d:'Giriş uğurlu oldu, amma bu e-poçt işçi siyahısında deyil. Supabase → SQL Editor-də bu sətri işlədin (quraşdırma bələdçisinə baxın):',
  /* onboarding */
  ob_w1_t:'Xoş gəldiniz!', ob_w1_d:'Bu, Master Optik-in öz idarə panelidir. Müştərilər, reseptlər, sifarişlər və anbar — hamısı bir yerdə. Məlumatlar buludda saxlanılır, telefondan da, kompüterdən də girə bilərsiniz.',
  ob_w2_t:'Gündəlik iş', ob_w2_d:'Müştəri gələndə: «Müştərilər» → yeni müştəri → resepti yazın. Sonra «Sifarişlər» → yeni sifariş: çərçivə və linzanı seçin, beh məbləğini yazın. Sifariş hazır olanda statusu «Hazır» edin — panel qalığı özü hesablayır.',
  ob_w3_t:'Anbar özü xəbər verir', ob_w3_d:'Hər malın minimum sayını təyin edin. Say o həddə düşəndə panel sizə xəbərdarlıq edir. Sifariş «Təhvil verilib» olanda mallar anbardan avtomatik silinir.',
  ob_w4_t:'Saytınız da buradan idarə olunur', ob_w4_d:'Saytdakı qalereya sizin Instagram paylaşımlarınızı göstərir — hansının görünəcəyini siz seçirsiniz. Saytdakı mətnləri də (başlıq, ünvan, iş saatları) buradan üç dildə dəyişə bilərsiniz.',
  ob_start:'Başlayaq', ob_next:'İrəli', ob_back:'Geri', ob_skip:'Keç',
  ob_check_t:'İlk addımlar', ob_check_d:'Bunları bir dəfə etsəniz, panel tam işlək olacaq.',
  ob_done_n:'tamamlandı', ob_go:'Keçid', ob_hide:'Bu siyahını gizlət',
  ob_alldone:'Hər şey hazırdır 🎉', ob_alldone_d:'Panel tam qurulub. Bu siyahını gizlədə bilərsiniz.',
  ob_ig:'Instagram-ı qoşun', ob_ig_d:'Saytdakı qalereya sizin paylaşımlarınızı göstərsin.',
  ob_prod:'İlk malı əlavə edin', ob_prod_d:'Bir çərçivə və ya linza yazın — anbar beləcə başlayır.',
  ob_cus:'İlk müştərini əlavə edin', ob_cus_d:'Ad və telefon kifayətdir; resepti sonra da yazmaq olar.',
  ob_ord:'İlk sifarişi yaradın', ob_ord_d:'Müştəri seçin, malları əlavə edin, beh məbləğini yazın.',
  ob_cnt:'Sayt mətnlərini yoxlayın', ob_cnt_d:'Ünvan, iş saatları və başlıqlar düzgündürmü?',
  /* contextual help */
  help_btn:'Bu bölmə nədir?',
  help_dashboard:'Günün mənzərəsi: bu ayın satışı, açıq sifarişlər, götürülməyi gözləyən hazır eynəklər və anbarda azalan mallar. Sətirə toxunanda sifariş açılır.',
  help_customers:'Hər müştərinin kartı: telefon, qeyd, bütün reseptləri və bütün sifarişləri. Kartda «Resept əlavə et» ilə yeni resept yazılır, çap düyməsi ilə müştəriyə verilir.',
  help_orders:'Sifariş = çərçivə + linza + qiymət. Statusu addım-addım dəyişin: Yeni → Sifariş verilib → Laboratoriyada → Hazır → Təhvil verilib. Beh yazsanız, qalıq özü hesablanır.',
  help_stock:'Anbardakı bütün mallar. +/− düymələri ilə sayı dəyişin. Minimum saydan aşağı düşən mallar qırmızı görünür və panelin yan menyusunda rəqəmlə göstərilir.',
  help_instagram:'Saytdakı qalereya. «İndi sinxronlaşdır» Instagram-dan son paylaşımları gətirir; göz düyməsi paylaşımı saytda gizlədir, oxlar sırasını dəyişir.',
  help_content:'Saytdakı mətnlər — üç dildə. Dəyişikliklər saytda dərhal görünür. Ünvan və iş saatlarını dəyişəndə bütün səhifələrdə yenilənir.',
  help_settings:'Şifrənizi buradan dəyişin və ayda bir dəfə ehtiyat nüsxə yükləyin.'
},
ru: {
  save:'Сохранить', cancel:'Отмена', del:'Удалить', edit:'Изменить', add:'Добавить',
  search:'Поиск', close:'Закрыть', back:'Назад', loading:'Загрузка…', none:'—',
  all:'Все', total:'Итого', actions:'Действия', notes:'Заметка', phone:'Телефон',
  name:'Имя', date:'Дата', status:'Статус', price:'Цена', qty:'Кол-во', print:'Печать',
  refresh:'Обновить', saved:'Сохранено', deleted:'Удалено', err:'Произошла ошибка',
  required:'Обязательное поле', sign_out:'Выйти', today:'Сегодня', open:'Открыть',
  confirm_del:'Удалить? Действие необратимо.', nothing:'Пока нет данных',
  email:'Эл. почта', password:'Пароль', optional:'необязательно', apply:'Применить',
  nav_dash:'Панель', nav_customers:'Клиенты', nav_orders:'Заказы',
  nav_stock:'Склад', nav_instagram:'Instagram', nav_content:'Тексты сайта',
  nav_settings:'Настройки', nav_work:'Работа', nav_site:'Сайт',
  dash_hi:'Добро пожаловать', dash_rev:'Продажи за месяц', dash_open:'Открытые заказы',
  dash_ready:'Готовы к выдаче', dash_low:'Заканчивается на складе',
  dash_recent:'Последние заказы', dash_readyl:'Ожидают выдачи',
  dash_lowl:'Скоро закончится', dash_all:'Смотреть все', dash_paid:'оплачено',
  dash_due:'остаток', dash_stockval:'Стоимость склада', dash_customers:'Клиентов',
  dash_late:'Просрочено', dash_pieces:'шт.',
  cus_title:'Клиенты', cus_new:'Новый клиент', cus_search:'Поиск по имени или телефону…',
  cus_name:'Имя и фамилия', cus_birth:'Дата рождения', cus_gender:'Пол', cus_addr:'Адрес',
  cus_none:'Клиенты не найдены', cus_since:'Регистрация', cus_rx:'Рецепты',
  cus_orders:'Заказы', cus_addrx:'Добавить рецепт', cus_card:'Карточка клиента',
  cus_lastrx:'Последний рецепт', cus_count:'клиентов',
  g_male:'Муж.', g_female:'Жен.',
  rx_title:'Рецепт', rx_issued:'Выдан', rx_doctor:'Врач', rx_od:'Правый (OD)',
  rx_os:'Левый (OS)', rx_sph:'SPH', rx_cyl:'CYL', rx_axis:'AXIS', rx_add:'ADD',
  rx_pd:'PD (мм)', rx_none:'Рецептов нет', rx_new:'Новый рецепт',
  ord_title:'Заказы', ord_new:'Новый заказ', ord_code:'Номер',
  ord_customer:'Клиент', ord_promised:'Срок', ord_items:'Позиции заказа',
  ord_desc:'Описание', ord_unit:'Цена за ед.', ord_disc:'Скидка', ord_paid:'Оплачено',
  ord_balance:'Остаток', ord_additem:'Добавить позицию', ord_pick:'Выбрать со склада',
  ord_none:'Заказов нет', ord_search:'Поиск по номеру или клиенту…',
  ord_deliver:'Выдан', ord_pickcus:'Выберите клиента', ord_rx:'Рецепт',
  ord_stockmsg:'Товары со склада списываются при выдаче заказа.',
  st_new:'Новый', st_ordered:'Заказан', st_in_lab:'В лаборатории',
  st_ready:'Готов', st_delivered:'Выдан', st_cancelled:'Отменён',
  stk_title:'Склад', stk_new:'Новый товар', stk_sku:'Код (SKU)', stk_cat:'Категория',
  stk_brand:'Бренд', stk_model:'Модель', stk_color:'Цвет', stk_size:'Размер',
  stk_cost:'Себестоимость', stk_sale:'Цена продажи', stk_min:'Минимум',
  stk_low:'Только заканчивающиеся', stk_none:'Товаров нет', stk_search:'Бренд, модель или код…',
  stk_value:'Стоимость склада', stk_adjust:'Изменить количество', stk_in:'Приход',
  stk_out:'Расход', stk_lowbadge:'Мало', stk_archived:'В архиве',
  stk_archive:'В архив', stk_unarchive:'Из архива', stk_reason:'Причина',
  stk_history:'История движения', stk_image:'Ссылка на фото',
  cat_frame:'Оправа', cat_sunglasses:'Солнцезащитные', cat_lens:'Линза',
  cat_contact:'Контактные линзы', cat_accessory:'Аксессуар', cat_solution:'Раствор',
  cat_other:'Другое',
  ig_title:'Галерея Instagram', ig_desc:'Галерея на сайте показывает только те посты Instagram, что видны здесь.',
  ig_connect:'Подключить Instagram', ig_token:'Access token', ig_sync:'Синхронизировать',
  ig_syncing:'Синхронизация…', ig_last:'Последняя синхронизация', ig_never:'никогда',
  ig_hide:'Скрыть', ig_show:'Показать', ig_up:'Вверх', ig_down:'Вниз',
  ig_none:'Постов пока нет — добавьте token и синхронизируйте.',
  ig_howto:'Как получить token? (пошаговая инструкция)', ig_saved:'Token сохранён',
  ig_got:'постов получено', ig_hidden:'Скрыт', ig_video:'Видео', ig_album:'Альбом',
  ig_mirror:'Сохраняются постоянные копии изображений…', ig_tokenmiss:'Сначала добавьте access token.',
  ig_expiry:'Token действует 60 дней — панель продлевает его автоматически.',
  ig_visible:'видно на сайте', ig_manual:'Ручной импорт',
  ig_manual_d:'Если браузер блокирует прямой запрос к Instagram: откройте ссылку ниже в новой вкладке, скопируйте JSON и вставьте сюда.',
  ig_openlink:'Открыть ссылку', ig_paste:'Текст JSON', ig_import:'Импортировать',
  ig_autosync:'При открытии панели посты обновляются автоматически (раз в сутки).',
  cnt_title:'Тексты сайта', cnt_desc:'Изменённые здесь тексты сразу появляются на сайте (после перезагрузки страницы).',
  cnt_hero:'Главный экран', cnt_services:'Услуги', cnt_gallery:'Галерея',
  cnt_about:'О нас', cnt_contact:'Контакты', cnt_general:'Общее',
  cnt_saveall:'Сохранить всё', cnt_changed:'изменений',
  set_title:'Настройки', set_conn:'Подключение к базе', set_url:'URL проекта',
  set_key:'Anon ключ', set_acc:'Аккаунт', set_pw:'Сменить пароль', set_newpw:'Новый пароль',
  set_backup:'Резервная копия', set_backupd:'Скачайте все данные в JSON. Рекомендуется раз в месяц.',
  set_download:'Скачать', set_docs:'Документация', set_disconnect:'Сбросить подключение',
  set_pwshort:'Пароль минимум 6 символов', set_tour:'Показать обучение заново',
  setup_title:'Настройка', setup_desc:'Панель ещё не подключена к базе. Введите данные вашего проекта Supabase.',
  setup_help:'Пошаговая инструкция по настройке',
  setup_connect:'Подключить', login_title:'Панель управления', login_sub:'Master Optik — вход',
  login_btn:'Войти', login_bad:'Неверная почта или пароль',
  login_forgot:'Забыли пароль?', login_sent:'Ссылка для сброса отправлена на почту',
  noacc_t:'Этому аккаунту не выдан доступ', noacc_d:'Вход выполнен, но эта почта не в списке сотрудников. Выполните эту строку в Supabase → SQL Editor (см. руководство):',
  ob_w1_t:'Добро пожаловать!', ob_w1_d:'Это панель управления Master Optik. Клиенты, рецепты, заказы и склад — всё в одном месте. Данные в облаке: заходите и с телефона, и с компьютера.',
  ob_w2_t:'Ежедневная работа', ob_w2_d:'Пришёл клиент: «Клиенты» → новый клиент → запишите рецепт. Затем «Заказы» → новый заказ: выберите оправу и линзы, укажите предоплату. Когда заказ готов — поставьте статус «Готов»; остаток посчитается сам.',
  ob_w3_t:'Склад предупреждает сам', ob_w3_d:'Задайте минимальное количество для товара. Когда остаток опустится до него, панель предупредит. При статусе «Выдан» товары списываются со склада автоматически.',
  ob_w4_t:'Сайт тоже управляется отсюда', ob_w4_d:'Галерея на сайте показывает ваши посты в Instagram — вы выбираете, какие именно. Тексты сайта (заголовки, адрес, часы работы) меняются здесь же, на трёх языках.',
  ob_start:'Начнём', ob_next:'Далее', ob_back:'Назад', ob_skip:'Пропустить',
  ob_check_t:'Первые шаги', ob_check_d:'Сделайте это один раз — и панель полностью готова.',
  ob_done_n:'выполнено', ob_go:'Перейти', ob_hide:'Скрыть список',
  ob_alldone:'Всё готово 🎉', ob_alldone_d:'Панель настроена. Список можно скрыть.',
  ob_ig:'Подключите Instagram', ob_ig_d:'Чтобы галерея на сайте показывала ваши посты.',
  ob_prod:'Добавьте первый товар', ob_prod_d:'Одна оправа или линза — так начинается склад.',
  ob_cus:'Добавьте первого клиента', ob_cus_d:'Достаточно имени и телефона; рецепт можно позже.',
  ob_ord:'Создайте первый заказ', ob_ord_d:'Выберите клиента, добавьте позиции, укажите предоплату.',
  ob_cnt:'Проверьте тексты сайта', ob_cnt_d:'Адрес, часы работы и заголовки — всё верно?',
  help_btn:'Что это за раздел?',
  help_dashboard:'Картина дня: продажи за месяц, открытые заказы, готовые к выдаче очки и заканчивающиеся товары. Нажатие на строку открывает заказ.',
  help_customers:'Карточка каждого клиента: телефон, заметки, все рецепты и заказы. В карточке можно добавить рецепт и распечатать его для клиента.',
  help_orders:'Заказ = оправа + линзы + цена. Меняйте статус по шагам: Новый → Заказан → В лаборатории → Готов → Выдан. Укажите предоплату — остаток посчитается сам.',
  help_stock:'Все товары склада. Кнопки +/− меняют количество. Товары ниже минимума подсвечиваются красным и считаются в боковом меню.',
  help_instagram:'Галерея сайта. «Синхронизировать» тянет последние посты из Instagram; глаз скрывает пост с сайта, стрелки меняют порядок.',
  help_content:'Тексты сайта на трёх языках. Изменения появляются на сайте сразу. Адрес и часы работы обновляются на всех страницах.',
  help_settings:'Здесь меняется пароль; раз в месяц скачивайте резервную копию.'
},
en: {
  save:'Save', cancel:'Cancel', del:'Delete', edit:'Edit', add:'Add',
  search:'Search', close:'Close', back:'Back', loading:'Loading…', none:'—',
  all:'All', total:'Total', actions:'Actions', notes:'Notes', phone:'Phone',
  name:'Name', date:'Date', status:'Status', price:'Price', qty:'Qty', print:'Print',
  refresh:'Refresh', saved:'Saved', deleted:'Deleted', err:'Something went wrong',
  required:'This field is required', sign_out:'Sign out', today:'Today', open:'Open',
  confirm_del:'Delete this? It cannot be undone.', nothing:'Nothing here yet',
  email:'Email', password:'Password', optional:'optional', apply:'Apply',
  nav_dash:'Dashboard', nav_customers:'Customers', nav_orders:'Orders',
  nav_stock:'Stock', nav_instagram:'Instagram', nav_content:'Site copy',
  nav_settings:'Settings', nav_work:'Work', nav_site:'Website',
  dash_hi:'Welcome', dash_rev:'Sales this month', dash_open:'Open orders',
  dash_ready:'Ready for pickup', dash_low:'Running low',
  dash_recent:'Recent orders', dash_readyl:'Waiting for pickup',
  dash_lowl:'Running out soon', dash_all:'View all', dash_paid:'paid',
  dash_due:'due', dash_stockval:'Stock value', dash_customers:'Customers',
  dash_late:'Overdue', dash_pieces:'pcs',
  cus_title:'Customers', cus_new:'New customer', cus_search:'Search by name or phone…',
  cus_name:'Full name', cus_birth:'Date of birth', cus_gender:'Gender', cus_addr:'Address',
  cus_none:'No customers found', cus_since:'Registered', cus_rx:'Prescriptions',
  cus_orders:'Orders', cus_addrx:'Add prescription', cus_card:'Customer card',
  cus_lastrx:'Latest prescription', cus_count:'customers',
  g_male:'Male', g_female:'Female',
  rx_title:'Prescription', rx_issued:'Issued', rx_doctor:'Doctor', rx_od:'Right (OD)',
  rx_os:'Left (OS)', rx_sph:'SPH', rx_cyl:'CYL', rx_axis:'AXIS', rx_add:'ADD',
  rx_pd:'PD (mm)', rx_none:'No prescriptions', rx_new:'New prescription',
  ord_title:'Orders', ord_new:'New order', ord_code:'No.',
  ord_customer:'Customer', ord_promised:'Promised', ord_items:'Order lines',
  ord_desc:'Description', ord_unit:'Unit price', ord_disc:'Discount', ord_paid:'Paid',
  ord_balance:'Balance', ord_additem:'Add line', ord_pick:'Pick from stock',
  ord_none:'No orders', ord_search:'Search by number or customer…',
  ord_deliver:'Delivered', ord_pickcus:'Pick a customer', ord_rx:'Prescription',
  ord_stockmsg:'Stock items are deducted when the order is delivered.',
  st_new:'New', st_ordered:'Ordered', st_in_lab:'In lab',
  st_ready:'Ready', st_delivered:'Delivered', st_cancelled:'Cancelled',
  stk_title:'Stock', stk_new:'New product', stk_sku:'SKU', stk_cat:'Category',
  stk_brand:'Brand', stk_model:'Model', stk_color:'Colour', stk_size:'Size',
  stk_cost:'Cost price', stk_sale:'Sale price', stk_min:'Minimum qty',
  stk_low:'Low stock only', stk_none:'No products', stk_search:'Brand, model or SKU…',
  stk_value:'Stock value at sale price', stk_adjust:'Adjust quantity', stk_in:'Stock in',
  stk_out:'Stock out', stk_lowbadge:'Low', stk_archived:'Archived',
  stk_archive:'Archive', stk_unarchive:'Unarchive', stk_reason:'Reason',
  stk_history:'Movement history', stk_image:'Image URL',
  cat_frame:'Frame', cat_sunglasses:'Sunglasses', cat_lens:'Lens',
  cat_contact:'Contact lenses', cat_accessory:'Accessory', cat_solution:'Solution',
  cat_other:'Other',
  ig_title:'Instagram gallery', ig_desc:'The website gallery shows only the Instagram posts that are visible here.',
  ig_connect:'Connect Instagram', ig_token:'Access token', ig_sync:'Sync now',
  ig_syncing:'Syncing…', ig_last:'Last sync', ig_never:'never',
  ig_hide:'Hide', ig_show:'Show', ig_up:'Up', ig_down:'Down',
  ig_none:'No posts yet — add a token and sync.',
  ig_howto:'How do I get a token? (step-by-step guide)', ig_saved:'Token saved',
  ig_got:'posts fetched', ig_hidden:'Hidden', ig_video:'Video', ig_album:'Album',
  ig_mirror:'Saving permanent copies of the images…', ig_tokenmiss:'Add an access token first.',
  ig_expiry:'The token lasts 60 days — the panel refreshes it automatically.',
  ig_visible:'visible on the site', ig_manual:'Manual import',
  ig_manual_d:'If the browser blocks the direct call to Instagram: open the link below in a new tab, copy the JSON it shows and paste it here.',
  ig_openlink:'Open link', ig_paste:'JSON text', ig_import:'Import',
  ig_autosync:'Posts refresh automatically once a day whenever the panel is opened.',
  cnt_title:'Site copy', cnt_desc:'Text you change here appears on the website right away (after a page reload).',
  cnt_hero:'Hero', cnt_services:'Services', cnt_gallery:'Gallery',
  cnt_about:'About', cnt_contact:'Contact', cnt_general:'General',
  cnt_saveall:'Save all', cnt_changed:'changes',
  set_title:'Settings', set_conn:'Database connection', set_url:'Project URL',
  set_key:'Anon key', set_acc:'Account', set_pw:'Change password', set_newpw:'New password',
  set_backup:'Backup', set_backupd:'Download all data as a JSON file. Once a month is a good habit.',
  set_download:'Download', set_docs:'Documentation', set_disconnect:'Reset connection',
  set_pwshort:'Password must be at least 6 characters', set_tour:'Replay the tour',
  setup_title:'Setup', setup_desc:'The panel is not connected to a database yet. Enter your Supabase project details.',
  setup_help:'Step-by-step setup guide',
  setup_connect:'Connect', login_title:'Admin panel', login_sub:'Master Optik — sign in',
  login_btn:'Sign in', login_bad:'Wrong email or password',
  login_forgot:'Forgot your password?', login_sent:'A reset link was sent to your email',
  noacc_t:'This account has not been granted access', noacc_d:'Sign-in worked, but this email is not on the staff list. Run this line in Supabase → SQL Editor (see the setup guide):',
  ob_w1_t:'Welcome!', ob_w1_d:'This is Master Optik\'s own admin panel. Customers, prescriptions, orders and stock in one place. The data lives in the cloud, so you can use it from a phone or a computer.',
  ob_w2_t:'The daily routine', ob_w2_d:'A customer walks in: Customers → new customer → record the prescription. Then Orders → new order: pick the frame and lenses, enter the deposit. When the job is ready set the status to Ready — the balance is worked out for you.',
  ob_w3_t:'Stock warns you itself', ob_w3_d:'Give every product a minimum quantity. When it drops that low the panel tells you. Setting an order to Delivered deducts its items from stock automatically.',
  ob_w4_t:'Your website is run from here too', ob_w4_d:'The website gallery shows your Instagram posts — you choose which ones. The site texts (headlines, address, opening hours) are edited here as well, in all three languages.',
  ob_start:'Let\'s start', ob_next:'Next', ob_back:'Back', ob_skip:'Skip',
  ob_check_t:'First steps', ob_check_d:'Do these once and the panel is fully set up.',
  ob_done_n:'done', ob_go:'Open', ob_hide:'Hide this list',
  ob_alldone:'All set 🎉', ob_alldone_d:'The panel is fully configured. You can hide this list.',
  ob_ig:'Connect Instagram', ob_ig_d:'So the website gallery shows your posts.',
  ob_prod:'Add your first product', ob_prod_d:'One frame or lens — that is how stock begins.',
  ob_cus:'Add your first customer', ob_cus_d:'A name and phone is enough; the prescription can come later.',
  ob_ord:'Create your first order', ob_ord_d:'Pick a customer, add the items, enter the deposit.',
  ob_cnt:'Check the website copy', ob_cnt_d:'Address, opening hours and headlines — all correct?',
  help_btn:'What is this section?',
  help_dashboard:'The shape of the day: sales this month, open orders, glasses ready for pickup and products running low. Tapping a row opens the order.',
  help_customers:'A card per customer: phone, notes, every prescription and every order. From the card you can add a prescription and print it for the customer.',
  help_orders:'An order = frame + lenses + price. Move the status along: New → Ordered → In lab → Ready → Delivered. Enter a deposit and the balance is calculated for you.',
  help_stock:'Everything in the warehouse. The +/− buttons change quantity. Products below their minimum turn red and are counted in the sidebar.',
  help_instagram:'The website gallery. Sync now pulls the latest posts from Instagram; the eye hides a post from the site, the arrows change the order.',
  help_content:'The website copy, in three languages. Changes appear on the site immediately. Address and opening hours update on every page.',
  help_settings:'Change your password here, and download a backup once a month.'
}
};

var lang = 'az';
try { lang = localStorage.getItem('mo_admin_lang') || localStorage.getItem('mo_lang') || 'az'; } catch (e) {}
if (!T[lang]) lang = 'az';

function t(key) { return (T[lang] && T[lang][key]) || T.az[key] || key; }

/* =====================================================================
   3. ICONS  (stroke, 24x24 viewBox)
   ===================================================================== */
var I = {
  dash:'<path d="M3 12h7V3H3v9Zm0 9h7v-6H3v6Zm11 0h7v-9h-7v9Zm0-18v6h7V3h-7Z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  orders:'<path d="M9 2h6l1 3H8l1-3Z"/><path d="M5 5h14l-1 16H6L5 5Z"/><path d="M9 11h6M9 15h4"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  ig:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>',
  text:'<path d="M4 6h16M4 12h10M4 18h13"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  chevL:'<path d="m15 18-6-6 6-6"/>',
  chevR:'<path d="m9 18 6-6-6-6"/>',
  up:'<path d="m18 15-6-6-6 6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  money:'<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 13 4 4L19 7"/>',
  alert:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.7A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.2-.9"/><path d="M3 3l18 18"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  sync:'<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  download:'<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  glasses:'<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 13.5c.8-.8 3.2-.8 4 0M3 11l1.5-3M21 11l-1.5-3"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>'
};

function ico(name, cls) {
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (I[name] || '') + '</svg>';
}

/* =====================================================================
   4. STATE + CONNECTION
   ===================================================================== */
var db = null;                 /* supabase client */
var session = null;            /* auth session */
var route = 'dashboard';
var cache = {};                /* per-view scratch state */

function config() {
  var c = window.MO_CONFIG || {};
  return { url: (c.SUPABASE_URL || '').trim().replace(/\/+$/, ''), key: (c.SUPABASE_ANON_KEY || '').trim() };
}

function connect() {
  var c = config();
  if (!c.url || !c.key || !window.supabase) return false;
  db = window.supabase.createClient(c.url, c.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mo-admin-auth' }
  });
  return true;
}

/* every query goes through here so one error path handles everything */
function guard(promise) {
  return promise.then(function (res) {
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  });
}

function fail(e) {
  console.error(e);
  toast((e && (e.message || e.error_description)) || t('err'), 'err');
}

/* =====================================================================
   5. TOASTS + MODALS
   ===================================================================== */
function toast(msg, kind) {
  var box = $('#toasts');
  var el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(function () { el.remove(); }, 320);
  }, kind === 'err' ? 5200 : 2800);
}

var openModals = [];

function modal(opts) {
  var scrim = document.createElement('div');
  scrim.className = 'scrim';
  var box = document.createElement('div');
  box.className = 'modal ' + (opts.side ? 'side' : 'pop');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML =
    '<div class="m-head">' +
      '<div style="flex:1;min-width:0">' +
        '<h3>' + esc(opts.title) + '</h3>' +
        (opts.sub ? '<div class="sub">' + esc(opts.sub) + '</div>' : '') +
      '</div>' +
      '<button class="btn icon ghost" data-close aria-label="' + esc(t('close')) + '">' + ico('x') + '</button>' +
    '</div>' +
    '<div class="m-body"></div>' +
    (opts.foot === false ? '' : '<div class="m-foot"></div>');

  var body = $('.m-body', box);
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else if (opts.body) body.appendChild(opts.body);

  var foot = $('.m-foot', box);
  if (foot) foot.innerHTML = opts.footHtml || '';

  document.body.appendChild(scrim);
  document.body.appendChild(box);

  var handle = {
    el: box, body: body, foot: foot,
    close: function () {
      box.remove(); scrim.remove();
      openModals = openModals.filter(function (m) { return m !== handle; });
      document.removeEventListener('keydown', onKey);
    }
  };
  function onKey(e) { if (e.key === 'Escape') handle.close(); }
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', handle.close);
  $$('[data-close]', box).forEach(function (b) { b.addEventListener('click', handle.close); });
  openModals.push(handle);

  var firstInput = $('input,select,textarea', body);
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
  return handle;
}

function confirmDelete(onYes) {
  var m = modal({
    title: t('del'),
    body: '<p>' + esc(t('confirm_del')) + '</p>',
    footHtml:
      '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn danger" data-yes>' + esc(t('del')) + '</button>'
  });
  $('[data-yes]', m.foot).addEventListener('click', function () { m.close(); onYes(); });
}

/* small helper: read a form into a plain object */
function readForm(root) {
  var out = {};
  $$('[name]', root).forEach(function (el) {
    var v = el.type === 'checkbox' ? el.checked : el.value;
    if (typeof v === 'string') v = v.trim();
    if (v === '') v = null;
    if (el.dataset.num != null && v != null) v = Number(v);
    out[el.name] = v;
  });
  return out;
}

function busy(btn, on) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  } else if (btn.dataset.label) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.label;
  }
}

/* =====================================================================
   6. SETUP WIZARD + LOGIN
   ===================================================================== */
function renderSetup() {
  var c = config();
  $('#root').innerHTML =
    '<div class="login"><div class="box">' +
      '<img class="mark" src="../images/logo.svg" alt="Master Optik">' +
      '<h1>' + esc(t('setup_title')) + '</h1>' +
      '<p class="sub">' + esc(t('setup_desc')) + '</p>' +
      '<form class="stack" id="setupForm">' +
        '<div class="field"><label>' + esc(t('set_url')) + '</label>' +
          '<input class="input" name="url" placeholder="https://xxxxxxxx.supabase.co" ' +
          'value="' + esc(c.url) + '" required></div>' +
        '<div class="field"><label>' + esc(t('set_key')) + ' (anon public)</label>' +
          '<textarea class="textarea" name="key" rows="3" ' +
          'placeholder="eyJhbGciOi…" required>' + esc(c.key) + '</textarea></div>' +
        '<button class="btn primary" type="submit">' + esc(t('setup_connect')) + '</button>' +
      '</form>' +
      '<div class="notice info" style="margin-top:18px">' + ico('info') +
        '<div><a href="guide.html" target="_blank" rel="noopener">' +
        esc(t('setup_help')) + '</a></div></div>' +
    '</div></div>';

  $('#setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = readForm(e.target);
    if (!f.url || !f.key) return;
    try {
      localStorage.setItem('mo_supabase', JSON.stringify({ url: f.url, key: f.key }));
    } catch (err) { return fail(err); }
    location.reload();
  });
}

function renderLogin(msg) {
  $('#root').innerHTML =
    '<div class="login"><div class="box">' +
      '<img class="mark" src="../images/logo.svg" alt="Master Optik">' +
      '<h1>' + esc(t('login_title')) + '</h1>' +
      '<p class="sub">' + esc(t('login_sub')) + '</p>' +
      (msg ? '<div class="notice err" style="margin-bottom:16px">' + ico('alert') +
             '<div>' + esc(msg) + '</div></div>' : '') +
      '<form class="stack" id="loginForm">' +
        '<div class="field"><label>' + esc(t('email')) + '</label>' +
          '<input class="input" type="email" name="email" autocomplete="username" required></div>' +
        '<div class="field"><label>' + esc(t('password')) + '</label>' +
          '<input class="input" type="password" name="password" autocomplete="current-password" required></div>' +
        '<button class="btn primary" type="submit">' + esc(t('login_btn')) + '</button>' +
      '</form>' +
      '<div class="row" style="margin-top:16px;justify-content:center">' +
        '<button class="btn ghost sm" id="forgot">' + esc(t('login_forgot')) + '</button>' +
      '</div>' +
      '<div class="row" style="margin-top:10px;justify-content:center">' + langSwitcher() + '</div>' +
    '</div></div>';

  wireLangSwitcher();

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('button[type=submit]', e.target);
    var f = readForm(e.target);
    busy(btn, true);
    db.auth.signInWithPassword({ email: f.email, password: f.password })
      .then(function (res) {
        if (res.error) { busy(btn, false); renderLogin(t('login_bad')); return; }
        session = res.data.session;
        boot();
      })
      .catch(function (err) { busy(btn, false); fail(err); });
  });

  $('#forgot').addEventListener('click', function () {
    var email = $('input[name=email]').value.trim();
    if (!email) { $('input[name=email]').focus(); return; }
    db.auth.resetPasswordForEmail(email, { redirectTo: location.href })
      .then(function () { toast(t('login_sent'), 'good'); })
      .catch(fail);
  });
}

/* =====================================================================
   7. APP SHELL + ROUTER
   ===================================================================== */
var NAV = [
  { group: 'nav_work' },
  { id: 'dashboard',  icon: 'dash',   label: 'nav_dash' },
  { id: 'customers',  icon: 'users',  label: 'nav_customers' },
  { id: 'orders',     icon: 'orders', label: 'nav_orders' },
  { id: 'stock',      icon: 'box',    label: 'nav_stock' },
  { group: 'nav_site' },
  { id: 'instagram',  icon: 'ig',     label: 'nav_instagram' },
  { id: 'content',    icon: 'text',   label: 'nav_content' },
  { id: 'settings',   icon: 'cog',    label: 'nav_settings' }
];

function langSwitcher() {
  return '<div class="langs" id="langs">' +
    ['az', 'ru', 'en'].map(function (l) {
      return '<button data-lang="' + l + '"' + (l === lang ? ' class="active"' : '') + '>' +
        l.toUpperCase() + '</button>';
    }).join('') + '</div>';
}

function wireLangSwitcher() {
  $$('#langs button').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.dataset.lang;
      try { localStorage.setItem('mo_admin_lang', lang); } catch (e) {}
      document.documentElement.lang = lang;
      if (session) { renderShell(); go(route, true); } else { renderLogin(); }
    });
  });
}

function renderShell() {
  var email = (session && session.user && session.user.email) || '';
  $('#root').innerHTML =
    '<div class="app">' +
      '<aside class="sidebar" id="sidebar">' +
        '<div class="brand">' +
          '<img src="../images/logo.svg" alt="">' +
          '<div><b>MASTER OPTİK</b><span>CRM</span></div>' +
        '</div>' +
        '<nav class="nav" id="nav">' +
          NAV.map(function (n) {
            if (n.group) return '<div class="group">' + esc(t(n.group)) + '</div>';
            return '<a href="#/' + n.id + '" data-route="' + n.id + '">' +
              ico(n.icon) + '<span>' + esc(t(n.label)) + '</span>' +
              '<span class="count" data-count="' + n.id + '" hidden></span></a>';
          }).join('') +
        '</nav>' +
        '<div class="foot">' +
          '<div class="who">' +
            '<div class="av">' + esc(initials(email.split('@')[0])) + '</div>' +
            '<div class="meta"><b>' + esc(email.split('@')[0]) + '</b>' +
              '<span>' + esc(email.split('@')[1] || '') + '</span></div>' +
            '<span class="spacer"></span>' +
            '<button class="btn icon ghost" id="signout" title="' + esc(t('sign_out')) + '">' +
              ico('logout') + '</button>' +
          '</div>' +
        '</div>' +
      '</aside>' +
      '<div class="main">' +
        '<div class="topbar">' +
          '<button class="btn icon ghost burger" id="burger" aria-label="menu">' + ico('menu') + '</button>' +
          '<h1 id="pageTitle"></h1>' +
          '<span class="spacer"></span>' +
          '<button class="btn sm" id="helpBtn">' + ico('info') +
            '<span class="hide-sm">' + esc(t('help_btn')) + '</span></button>' +
          langSwitcher() +
        '</div>' +
        '<div class="content" id="view"></div>' +
      '</div>' +
    '</div>';

  wireLangSwitcher();

  $('#signout').addEventListener('click', function () {
    db.auth.signOut().then(function () { session = null; renderLogin(); });
  });

  $('#burger').addEventListener('click', function () {
    document.body.classList.toggle('nav-open');
  });

  $('#helpBtn').addEventListener('click', function () { showHelp(route); });

  $('#nav').addEventListener('click', function (e) {
    if (e.target.closest('a')) document.body.classList.remove('nav-open');
  });

  refreshBadges();
}

/* small counters in the sidebar: open orders, low stock */
function refreshBadges() {
  if (!db) return;

  db.from('orders').select('id', { count: 'exact', head: true })
    .in('status', ['new', 'ordered', 'in_lab', 'ready'])
    .then(function (r) { setBadge('orders', r.count || 0); })
    .catch(function () {});

  guard(db.from('products').select('qty,min_qty').eq('archived', false).limit(2000))
    .then(function (rows) {
      setBadge('stock', (rows || []).filter(function (p) {
        return num(p.qty) <= num(p.min_qty);
      }).length);
    })
    .catch(function () {});
}

function setBadge(id, n) {
  var el = $('[data-count="' + id + '"]');
  if (!el) return;
  if (n) { el.textContent = n; el.hidden = false; } else { el.hidden = true; }
}

var VIEWS = {};   /* filled in by the module sections below */

function go(name, keepHash) {
  if (!VIEWS[name]) name = 'dashboard';
  openModals.slice().forEach(function (m) { m.close(); });
  route = name;
  if (!keepHash) location.hash = '#/' + name;
  $$('#nav a').forEach(function (a) {
    a.classList.toggle('active', a.dataset.route === name);
  });
  var meta = NAV.filter(function (n) { return n.id === name; })[0];
  $('#pageTitle').textContent = meta ? t(meta.label) : '';
  var view = $('#view');
  view.innerHTML = '<div class="loading"><div class="spinner dark"></div></div>';
  Promise.resolve(VIEWS[name](view)).catch(function (e) {
    fail(e);
    view.innerHTML = '<div class="notice err">' + ico('alert') +
      '<div>' + esc((e && e.message) || t('err')) + '</div></div>';
  });
}

function currentHash() {
  var m = (location.hash || '').match(/^#\/([a-z]+)/);
  return m ? m[1] : 'dashboard';
}

window.addEventListener('hashchange', function () {
  var name = currentHash();
  if (name !== route) go(name, true);
});

/* =====================================================================
   ONBOARDING
   The client is handed a link and nothing else, so the panel has to
   introduce itself: a short tour on the very first sign-in, then a
   checklist that stays on the dashboard until the shop is actually set
   up. Progress is derived from real data (is there a product? a
   customer? an order?) rather than from clicking through, and the state
   lives in `settings` so it follows the shop, not the browser.
   ===================================================================== */
var WELCOME_STEPS = ['ob_w1', 'ob_w2', 'ob_w3', 'ob_w4'];
var WELCOME_ICONS = ['glasses', 'users', 'box', 'ig'];

function obGet() {
  return guard(db.from('settings').select('value').eq('key', 'onboarding').maybeSingle())
    .then(function (row) { return (row && row.value) || {}; })
    .catch(function () { return {}; });
}

function obSave(value) {
  return guard(db.from('settings').upsert({ key: 'onboarding', value: value },
    { onConflict: 'key' })).catch(function () {});
}

function showWelcome(state) {
  var step = 0;
  var m = modal({ title: 'Master Optik CRM', foot: false, body: '<div id="obBody"></div>' });

  function paint() {
    var key = WELCOME_STEPS[step];
    $('#obBody', m.body).innerHTML =
      '<div class="ob-step">' +
        '<div class="ob-ico">' + ico(WELCOME_ICONS[step]) + '</div>' +
        '<h3>' + esc(t(key + '_t')) + '</h3>' +
        '<p>' + esc(t(key + '_d')) + '</p>' +
        '<div class="ob-dots">' + WELCOME_STEPS.map(function (_, i) {
          return '<span' + (i === step ? ' class="on"' : '') + '></span>';
        }).join('') + '</div>' +
        '<div class="row" style="margin-top:18px">' +
          (step ? '<button class="btn" id="obBack">' + esc(t('ob_back')) + '</button>' : '') +
          '<span class="spacer"></span>' +
          '<button class="btn ghost" id="obSkip">' + esc(t('ob_skip')) + '</button>' +
          '<button class="btn primary" id="obNext">' +
            esc(step === WELCOME_STEPS.length - 1 ? t('ob_start') : t('ob_next')) + '</button>' +
        '</div>' +
      '</div>';

    var back = $('#obBack', m.body);
    if (back) back.addEventListener('click', function () { step--; paint(); });
    $('#obSkip', m.body).addEventListener('click', done);
    $('#obNext', m.body).addEventListener('click', function () {
      if (step === WELCOME_STEPS.length - 1) return done();
      step++; paint();
    });
  }

  function done() {
    state.seen = true;
    obSave(state);
    m.close();
    go('dashboard');
  }

  paint();
}

/* what still needs doing, measured against the database itself */
function obProgress() {
  return Promise.all([
    db.from('products').select('id', { count: 'exact', head: true }),
    db.from('customers').select('id', { count: 'exact', head: true }),
    db.from('orders').select('id', { count: 'exact', head: true }),
    db.from('instagram_posts').select('id', { count: 'exact', head: true }),
    obGet()
  ]).then(function (r) {
    return {
      state: r[4] || {},
      items: [
        { id: 'ig',   icon: 'ig',     route: 'instagram', done: (r[3].count || 0) > 0 },
        { id: 'prod', icon: 'box',    route: 'stock',     done: (r[0].count || 0) > 0 },
        { id: 'cus',  icon: 'users',  route: 'customers', done: (r[1].count || 0) > 0 },
        { id: 'ord',  icon: 'orders', route: 'orders',    done: (r[2].count || 0) > 0 },
        { id: 'cnt',  icon: 'text',   route: 'content',   done: !!(r[4] && r[4].content_seen) }
      ]
    };
  });
}

function obCardHtml(items) {
  var done = items.filter(function (i) { return i.done; }).length;
  var all = done === items.length;
  return '<div class="card ob-card" id="obCard"><div class="body">' +
    '<div class="row wrap" style="margin-bottom:14px">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:800">' +
          esc(all ? t('ob_alldone') : t('ob_check_t')) + '</div>' +
        '<div class="small muted">' + esc(all ? t('ob_alldone_d') : t('ob_check_d')) + '</div>' +
      '</div>' +
      '<span class="spacer"></span>' +
      '<div class="ob-progress" title="' + done + '/' + items.length + '">' +
        '<b>' + done + '</b> / ' + items.length + ' ' + esc(t('ob_done_n')) + '</div>' +
      '<button class="btn ghost sm" id="obHide">' + esc(t('ob_hide')) + '</button>' +
    '</div>' +
    '<div class="ob-list">' +
      items.map(function (i) {
        return '<div class="ob-item' + (i.done ? ' done' : '') + '">' +
          '<span class="tick">' + ico(i.done ? 'check' : i.icon) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<b>' + esc(t('ob_' + i.id)) + '</b>' +
            '<div class="small muted">' + esc(t('ob_' + i.id + '_d')) + '</div>' +
          '</div>' +
          (i.done ? '' : '<a class="btn sm" href="#/' + i.route + '">' +
            esc(t('ob_go')) + '</a>') +
        '</div>';
      }).join('') +
    '</div></div></div><div style="height:20px"></div>';
}

function showHelp(view) {
  var key = 'help_' + (view || 'dashboard');
  modal({
    title: t('help_btn'),
    body: '<p>' + esc(t(key)) + '</p>',
    footHtml: '<span class="spacer"></span>' +
      '<button class="btn primary" data-close>' + esc(t('close')) + '</button>'
  });
}

/* =====================================================================
   boot
   ===================================================================== */

/* Signing in is not the same as being allowed in: the database only
   answers to users listed in public.staff. The panel asks up front so a
   stranger who registered an account gets a clear message instead of a
   set of mysteriously empty screens. */
function checkStaff() {
  if (!db || typeof db.rpc !== 'function') return Promise.resolve(true);
  return Promise.resolve(db.rpc('is_staff')).then(function (r) {
    if (r.error) throw r.error;
    return r.data === true;
  });
}

function renderNoAccess() {
  var email = (session && session.user && session.user.email) || '';
  var sql = "insert into public.staff (user_id, email)\n" +
            "select id, email from auth.users where email = '" + email + "'\n" +
            "on conflict (user_id) do nothing;";
  $('#root').innerHTML =
    '<div class="login"><div class="box">' +
      '<img class="mark" src="../images/logo.svg" alt="Master Optik">' +
      '<h1>' + esc(t('noacc_t')) + '</h1>' +
      '<p class="sub">' + esc(email) + '</p>' +
      '<div class="notice warn" style="text-align:left">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><path d="M12 9v4M12 17h.01"/>' +
          '<path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>' +
        '<div>' + esc(t('noacc_d')) +
          '<pre class="snippet">' + esc(sql) + '</pre></div>' +
      '</div>' +
      '<div class="row" style="margin-top:18px">' +
        '<a class="btn" href="guide.html" target="_blank" rel="noopener">' +
          esc(t('set_docs')) + '</a>' +
        '<span class="spacer"></span>' +
        '<button class="btn" id="noAccOut">' + esc(t('sign_out')) + '</button>' +
      '</div>' +
    '</div></div>';
  $('#noAccOut').addEventListener('click', function () {
    db.auth.signOut().then(function () { session = null; renderLogin(); });
  });
}

function boot() {
  checkStaff()
    .catch(function () { return true; })   /* schema without is_staff(): RLS still decides */
    .then(function (allowed) {
      if (!allowed) return renderNoAccess();
      renderShell();
      go(currentHash(), true);
      igAutoRefreshToken();
      igAutoSync();
      obGet().then(function (state) {
        if (!state.seen) showWelcome(state);
      });
    });
}

function start() {
  if (!connect()) { renderSetup(); return; }
  db.auth.getSession().then(function (res) {
    session = res.data.session;
    if (!session) { renderLogin(); return; }
    boot();
  }).catch(function (e) {
    fail(e);
    renderLogin();
  });
  db.auth.onAuthStateChange(function (event, s) {
    session = s;
    if (event === 'SIGNED_OUT') renderLogin();
  });
}

/* ===================================================================== */
/* shared UI fragments used by several views                              */
/* ===================================================================== */
function emptyState(text, actionHtml) {
  return '<div class="empty">' + ico('box') + '<b>' + esc(text) + '</b>' +
    (actionHtml || '') + '</div>';
}

function searchBox(id, placeholder, value) {
  return '<div class="search">' + ico('search') +
    '<input class="input" id="' + id + '" type="search" placeholder="' + esc(placeholder) + '" ' +
    'value="' + esc(value || '') + '"></div>';
}

var ORDER_STATUSES = ['new', 'ordered', 'in_lab', 'ready', 'delivered', 'cancelled'];
var CATEGORIES = ['frame', 'sunglasses', 'lens', 'contact', 'accessory', 'solution', 'other'];

function statusBadge(s) {
  return '<span class="badge ' + s + '">' + esc(t('st_' + s)) + '</span>';
}

function selectOptions(values, prefix, current) {
  return values.map(function (v) {
    return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' +
      esc(t(prefix + v)) + '</option>';
  }).join('');
}

/* =====================================================================
   8. DASHBOARD
   ===================================================================== */
VIEWS.dashboard = function (view) {
  return Promise.all([
    obProgress().catch(function () { return null; }),
    guard(db.from('orders_view').select('*').order('created_at', { ascending: false }).limit(200)),
    guard(db.from('products').select('id,brand,model,sku,qty,min_qty,sale_price,category')
            .eq('archived', false).limit(2000)),
    db.from('customers').select('id', { count: 'exact', head: true })
  ]).then(function (r) {
    var ob = r[0];
    var orders = r[1] || [], products = r[2] || [], customerCount = (r[3] && r[3].count) || 0;

    var since = monthStart();
    var revenue = orders.reduce(function (sum, o) {
      return o.created_at >= since && o.status !== 'cancelled' ? sum + num(o.paid) : sum;
    }, 0);
    var open = orders.filter(function (o) {
      return ['new', 'ordered', 'in_lab'].indexOf(o.status) >= 0;
    });
    var ready = orders.filter(function (o) { return o.status === 'ready'; });
    var low = products.filter(function (p) { return num(p.qty) <= num(p.min_qty); });
    var stockValue = products.reduce(function (s, p) { return s + num(p.qty) * num(p.sale_price); }, 0);
    var late = open.concat(ready).filter(function (o) {
      return o.promised_on && daysUntil(o.promised_on) < 0;
    });

    var kpis =
      '<div class="kpis">' +
        kpi('o', 'money', t('dash_rev'), money(revenue), t('dash_paid') + ' · ' + monthName()) +
        kpi('t', 'orders', t('dash_open'), String(open.length),
            late.length ? '<span style="color:var(--red);font-weight:700">' +
              esc(t('dash_late')) + ': ' + late.length + '</span>'
            : nextPromised(open)) +
        kpi('g', 'check', t('dash_ready'), String(ready.length), t('dash_readyl')) +
        kpi('r', 'alert', t('dash_low'), String(low.length),
            t('dash_stockval') + ': ' + money(stockValue)) +
      '</div>';

    var recent = orders.slice(0, 8);

    var obHtml = '';
    if (ob && !ob.state.dismissed && ob.items.some(function (i) { return !i.done; })) {
      obHtml = obCardHtml(ob.items);
    }

    view.innerHTML = obHtml + kpis +
      '<div class="grid-2" style="align-items:start">' +
        card(t('dash_recent'), ordersTable(recent, true),
             '<a class="btn sm" href="#/orders">' + esc(t('dash_all')) + '</a>') +
        card(t('dash_readyl'), ordersTable(ready.slice(0, 8), true), '') +
      '</div>' +
      '<div style="height:16px"></div>' +
      card(t('dash_lowl'), lowTable(low.slice(0, 10)),
           '<a class="btn sm" href="#/stock">' + esc(t('dash_all')) + '</a>') +
      '<div style="height:16px"></div>' +
      '<div class="grid-3">' +
        miniStat(t('dash_customers'), String(customerCount), 'users') +
        miniStat(t('dash_stockval'), money(stockValue), 'box') +
        miniStat(t('stk_title'), products.reduce(function (s, p) { return s + num(p.qty); }, 0) +
                 ' ' + t('dash_pieces'), 'card') +
      '</div>';

    $$('tr[data-order]', view).forEach(function (tr) {
      tr.addEventListener('click', function () { openOrder(tr.dataset.order); });
    });
    $$('tr[data-product]', view).forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/stock'; });
    });
    var hide = $('#obHide', view);
    if (hide) hide.addEventListener('click', function () {
      ob.state.dismissed = true;
      obSave(ob.state);
      var card = $('#obCard', view);
      if (card) { card.remove(); }
    });
  });

  /* the soonest promise still outstanding — the number the shop actually cares about */
  function nextPromised(openOrders) {
    var dates = openOrders.map(function (o) { return o.promised_on; })
      .filter(Boolean).sort();
    if (!dates.length) return esc(t('nothing'));
    return esc(t('ord_promised')) + ': ' + esc(fmtDate(dates[0]));
  }

  function monthName() {
    var names = {
      az: ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'],
      ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
      en: ['January','February','March','April','May','June','July','August','September','October','November','December']
    };
    return (names[lang] || names.az)[new Date().getMonth()];
  }
};

function kpi(tone, icon, label, value, hint) {
  return '<div class="kpi ' + tone + '">' +
    '<div class="ico">' + ico(icon) + '</div>' +
    '<div class="label">' + esc(label) + '</div>' +
    '<div class="value">' + esc(value) + '</div>' +
    '<div class="hint">' + hint + '</div></div>';
}

function miniStat(label, value, icon) {
  return '<div class="card"><div class="body row">' +
    '<div class="kpi-ico" style="width:36px;height:36px;border-radius:10px;background:var(--panel-2);' +
    'border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted)">' +
    ico(icon) + '</div>' +
    '<div><div class="small muted" style="font-weight:700">' + esc(label) + '</div>' +
    '<div style="font-size:19px;font-weight:800" class="tabular">' + esc(value) + '</div></div>' +
    '</div></div>';
}

function card(title, bodyHtml, headRight) {
  return '<div class="card">' +
    '<div class="head"><h2>' + esc(title) + '</h2><span class="spacer"></span>' +
      (headRight || '') + '</div>' +
    '<div class="body flush">' + bodyHtml + '</div></div>';
}

function ordersTable(rows, compact, hideCustomer) {
  if (!rows.length) return emptyState(t('ord_none'));
  return '<div class="table-wrap"><table class="tbl"><thead><tr>' +
    '<th>' + esc(t('ord_code')) + '</th>' +
    (hideCustomer ? '' : '<th>' + esc(t('ord_customer')) + '</th>') +
    '<th>' + esc(t('status')) + '</th>' +
    (compact ? '' : '<th>' + esc(t('ord_promised')) + '</th>') +
    '<th class="right">' + esc(t('total')) + '</th>' +
    '<th class="right">' + esc(t('ord_balance')) + '</th>' +
    '</tr></thead><tbody>' +
    rows.map(function (o) {
      var lateCls = o.promised_on && daysUntil(o.promised_on) < 0 &&
        ['delivered', 'cancelled'].indexOf(o.status) < 0;
      return '<tr class="clickable" data-order="' + esc(o.id) + '">' +
        '<td class="strong nowrap">' + esc(o.code) + '</td>' +
        (hideCustomer ? '' : '<td>' + esc(o.customer_name || '—') +
          (o.customer_phone ? '<div class="small faint">' + esc(formatPhone(o.customer_phone)) +
            '</div>' : '') + '</td>') +
        '<td>' + statusBadge(o.status) + '</td>' +
        (compact ? '' : '<td class="nowrap' + (lateCls ? '" style="color:var(--red);font-weight:700' : '') +
          '">' + fmtDate(o.promised_on) + '</td>') +
        '<td class="right tabular nowrap">' + money(o.total) + '</td>' +
        '<td class="right tabular nowrap' + (num(o.balance) > 0 ? ' strong' : '') + '">' +
          (num(o.balance) > 0 ? money(o.balance) : '<span class="faint">—</span>') + '</td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

function lowTable(rows) {
  if (!rows.length) return emptyState(t('nothing'));
  return '<div class="table-wrap"><table class="tbl"><thead><tr>' +
    '<th>' + esc(t('stk_brand')) + ' / ' + esc(t('stk_model')) + '</th>' +
    '<th>' + esc(t('stk_cat')) + '</th>' +
    '<th class="right">' + esc(t('qty')) + '</th>' +
    '<th class="right">' + esc(t('stk_min')) + '</th>' +
    '</tr></thead><tbody>' +
    rows.map(function (p) {
      return '<tr class="clickable" data-product="' + esc(p.id) + '">' +
        '<td class="strong">' + esc([p.brand, p.model].filter(Boolean).join(' ') || p.sku || '—') + '</td>' +
        '<td class="muted">' + esc(t('cat_' + p.category)) + '</td>' +
        '<td class="right tabular"><span class="badge ' + (num(p.qty) <= 0 ? 'low' : 'ordered') + '">' +
          num(p.qty) + '</span></td>' +
        '<td class="right tabular muted">' + num(p.min_qty) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* =====================================================================
   9. CUSTOMERS + PRESCRIPTIONS
   ===================================================================== */
VIEWS.customers = function (view) {
  cache.cusQuery = cache.cusQuery || '';

  view.innerHTML =
    '<div class="row wrap" style="margin-bottom:16px">' +
      searchBox('cusSearch', t('cus_search'), cache.cusQuery) +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="newCus">' + ico('plus') + esc(t('cus_new')) + '</button>' +
    '</div>' +
    '<div class="card"><div class="body flush" id="cusList">' +
      '<div class="loading"><div class="spinner dark"></div></div></div></div>';

  $('#newCus').addEventListener('click', function () { editCustomer(null, load); });
  $('#cusSearch').addEventListener('input', debounce(function (e) {
    cache.cusQuery = e.target.value.trim();
    load();
  }, 260));

  function load() {
    var q = db.from('customers')
      .select('id,full_name,phone,email,birth_date,created_at,notes')
      .order('created_at', { ascending: false }).limit(300);
    if (cache.cusQuery) {
      var term = '%' + cache.cusQuery.replace(/[,%]/g, '') + '%';
      q = q.or('full_name.ilike.' + term + ',phone.ilike.' + term + ',email.ilike.' + term);
    }
    return guard(q).then(render).catch(fail);
  }

  function render(rows) {
    var box = $('#cusList');
    if (!rows.length) { box.innerHTML = emptyState(t('cus_none')); return; }
    box.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>' + esc(t('cus_name')) + '</th>' +
      '<th>' + esc(t('phone')) + '</th>' +
      '<th class="hide-sm">' + esc(t('email')) + '</th>' +
      '<th class="hide-sm">' + esc(t('cus_since')) + '</th>' +
      '<th></th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr class="clickable" data-id="' + esc(c.id) + '">' +
          '<td><div class="row"><div class="av" style="width:30px;height:30px;border-radius:50%;' +
            'flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;' +
            'font-size:11.5px;color:#fff;background:linear-gradient(135deg,var(--teal),#0f8f7e)">' +
            esc(initials(c.full_name)) + '</div>' +
            '<span class="strong">' + esc(c.full_name) + '</span></div></td>' +
          '<td class="nowrap">' + (c.phone
            ? '<a href="tel:+' + esc(phoneDigits(c.phone)) + '">' + esc(formatPhone(c.phone)) + '</a>'
            : '<span class="faint">—</span>') + '</td>' +
          '<td class="hide-sm muted">' + esc(c.email || '—') + '</td>' +
          '<td class="hide-sm muted nowrap">' + fmtDate(c.created_at) + '</td>' +
          '<td class="right">' + ico('chevR', 'faint') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    $$('#cusList tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () { openCustomer(tr.dataset.id, load); });
    });
  }

  return load();
};

function editCustomer(customer, done) {
  var c = customer || {};
  var m = modal({
    title: c.id ? t('edit') : t('cus_new'),
    body:
      '<form id="cusForm" class="stack">' +
        '<div class="field"><label>' + esc(t('cus_name')) + ' *</label>' +
          '<input class="input" name="full_name" required value="' + esc(c.full_name || '') + '"></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('phone')) + '</label>' +
            '<input class="input" name="phone" inputmode="tel" placeholder="+994 __ ___ __ __" ' +
            'value="' + esc(c.phone || '') + '"></div>' +
          '<div class="field"><label>' + esc(t('email')) + '</label>' +
            '<input class="input" type="email" name="email" value="' + esc(c.email || '') + '"></div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('cus_birth')) + '</label>' +
            '<input class="input" type="date" name="birth_date" value="' + esc(c.birth_date || '') + '"></div>' +
          '<div class="field"><label>' + esc(t('cus_gender')) + '</label>' +
            '<select class="select" name="gender">' +
              '<option value="">' + esc(t('none')) + '</option>' +
              '<option value="male"' + (c.gender === 'male' ? ' selected' : '') + '>' + esc(t('g_male')) + '</option>' +
              '<option value="female"' + (c.gender === 'female' ? ' selected' : '') + '>' + esc(t('g_female')) + '</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="field"><label>' + esc(t('cus_addr')) + '</label>' +
          '<input class="input" name="address" value="' + esc(c.address || '') + '"></div>' +
        '<div class="field"><label>' + esc(t('notes')) + '</label>' +
          '<textarea class="textarea" name="notes">' + esc(c.notes || '') + '</textarea></div>' +
      '</form>',
    footHtml:
      (c.id ? '<button class="btn danger" id="delCus">' + esc(t('del')) + '</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="saveCus">' + esc(t('save')) + '</button>'
  });

  $('#saveCus', m.foot).addEventListener('click', function (e) {
    var form = $('#cusForm', m.body);
    if (!form.reportValidity()) return;
    var data = readForm(form);
    busy(e.currentTarget, true);
    var op = c.id
      ? db.from('customers').update(data).eq('id', c.id)
      : db.from('customers').insert(data);
    guard(op).then(function () {
      toast(t('saved'), 'good'); m.close(); if (done) done();
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });

  if (c.id) {
    $('#delCus', m.foot).addEventListener('click', function () {
      confirmDelete(function () {
        guard(db.from('customers').delete().eq('id', c.id)).then(function () {
          toast(t('deleted')); m.close(); if (done) done();
        }).catch(fail);
      });
    });
  }
}

function openCustomer(id, done) {
  var m = modal({
    side: true, title: t('cus_card'), foot: false,
    body: '<div class="loading"><div class="spinner dark"></div></div>'
  });

  function load() {
    return Promise.all([
      guard(db.from('customers').select('*').eq('id', id).single()),
      guard(db.from('prescriptions').select('*').eq('customer_id', id)
              .order('issued_on', { ascending: false })),
      guard(db.from('orders_view').select('*').eq('customer_id', id)
              .order('created_at', { ascending: false }))
    ]).then(function (r) { render(r[0], r[1] || [], r[2] || []); }).catch(fail);
  }

  function render(c, rxs, orders) {
    $('.m-head h3', m.el).textContent = c.full_name;
    var sub = $('.m-head .sub', m.el);
    if (!sub) {
      sub = document.createElement('div');
      sub.className = 'sub';
      $('.m-head div', m.el).appendChild(sub);
    }
    sub.textContent = [formatPhone(c.phone), c.email].filter(Boolean).join(' · ') || t('cus_card');

    m.body.innerHTML =
      '<div class="row wrap">' +
        (c.phone ? '<a class="btn sm" href="tel:+' + esc(phoneDigits(c.phone)) + '">' +
          esc(formatPhone(c.phone)) + '</a>' : '') +
        (c.phone ? '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' +
          esc(phoneDigits(c.phone)) + '">WhatsApp</a>' : '') +
        '<span class="spacer"></span>' +
        '<button class="btn sm" id="cEdit">' + ico('edit') + esc(t('edit')) + '</button>' +
      '</div>' +
      (c.notes ? '<div class="notice info">' + ico('info') + '<div>' + esc(c.notes) + '</div></div>' : '') +
      '<div class="grid-2">' +
        infoBit(t('cus_birth'), fmtDate(c.birth_date)) +
        infoBit(t('cus_since'), fmtDate(c.created_at)) +
      '</div>' +

      '<div class="row" style="margin-top:4px">' +
        '<div class="section-label">' + esc(t('cus_rx')) + ' (' + rxs.length + ')</div>' +
        '<span class="spacer"></span>' +
        '<button class="btn sm" id="addRx">' + ico('plus') + esc(t('cus_addrx')) + '</button>' +
      '</div>' +
      (rxs.length ? rxs.map(rxCard).join('') :
        '<div class="muted small">' + esc(t('rx_none')) + '</div>') +

      '<div class="row" style="margin-top:8px">' +
        '<div class="section-label">' + esc(t('cus_orders')) + ' (' + orders.length + ')</div>' +
        '<span class="spacer"></span>' +
        '<button class="btn sm" id="addOrd">' + ico('plus') + esc(t('ord_new')) + '</button>' +
      '</div>' +
      (orders.length ? '<div class="card"><div class="body flush">' +
        ordersTable(orders, true, true) + '</div></div>' :
        '<div class="muted small">' + esc(t('ord_none')) + '</div>');

    $('#cEdit', m.body).addEventListener('click', function () {
      editCustomer(c, function () { load(); if (done) done(); });
    });
    $('#addRx', m.body).addEventListener('click', function () {
      editPrescription({ customer_id: id }, load);
    });
    $('#addOrd', m.body).addEventListener('click', function () {
      m.close();
      editOrder({ customer_id: id, customer_name: c.full_name }, function () { if (done) done(); });
    });
    $$('[data-rx]', m.body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rx = rxs.filter(function (x) { return x.id === btn.dataset.rx; })[0];
        if (btn.dataset.act === 'print') printPrescription(c, rx);
        else editPrescription(rx, load);
      });
    });
    $$('tr[data-order]', m.body).forEach(function (tr) {
      tr.addEventListener('click', function () { m.close(); openOrder(tr.dataset.order); });
    });
  }

  load();
}

function infoBit(label, value) {
  return '<div><div class="small muted" style="font-weight:700">' + esc(label) + '</div>' +
    '<div style="font-weight:700">' + esc(value) + '</div></div>';
}

function rxCard(rx) {
  function cell(v) { return '<td class="center tabular">' + esc(dpt(v)) + '</td>'; }
  return '<div class="card" style="box-shadow:none"><div class="body">' +
    '<div class="row" style="margin-bottom:8px">' +
      '<b>' + esc(fmtDate(rx.issued_on)) + '</b>' +
      (rx.doctor ? '<span class="muted small">· ' + esc(rx.doctor) + '</span>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn icon ghost" data-rx="' + esc(rx.id) + '" data-act="print" ' +
        'title="' + esc(t('print')) + '">' + ico('card') + '</button>' +
      '<button class="btn icon ghost" data-rx="' + esc(rx.id) + '" data-act="edit" ' +
        'title="' + esc(t('edit')) + '">' + ico('edit') + '</button>' +
    '</div>' +
    '<table class="rx"><thead><tr><th></th><th>SPH</th><th>CYL</th><th>AXIS</th><th>ADD</th></tr></thead>' +
    '<tbody>' +
      '<tr><td class="eye">OD</td>' + cell(rx.od_sph) + cell(rx.od_cyl) +
        '<td class="center tabular">' + (rx.od_axis != null ? esc(rx.od_axis) + '°' : '—') + '</td>' +
        cell(rx.od_add) + '</tr>' +
      '<tr><td class="eye">OS</td>' + cell(rx.os_sph) + cell(rx.os_cyl) +
        '<td class="center tabular">' + (rx.os_axis != null ? esc(rx.os_axis) + '°' : '—') + '</td>' +
        cell(rx.os_add) + '</tr>' +
    '</tbody></table>' +
    '<div class="row small muted" style="margin-top:8px">' +
      '<span>PD: <b>' + (rx.pd != null ? esc(rx.pd) + ' mm' : '—') + '</b></span>' +
      (rx.notes ? '<span>· ' + esc(rx.notes) + '</span>' : '') +
    '</div>' +
    '</div></div>';
}

function editPrescription(rx, done) {
  rx = rx || {};
  function n(name, value, step, ph) {
    return '<input class="input" name="' + name + '" data-num="1" type="number" ' +
      'step="' + (step || '0.25') + '" placeholder="' + (ph || '') + '" ' +
      'value="' + (value != null ? esc(value) : '') + '">';
  }
  var m = modal({
    title: rx.id ? t('rx_title') : t('rx_new'),
    body:
      '<form id="rxForm" class="stack">' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('rx_issued')) + '</label>' +
            '<input class="input" type="date" name="issued_on" value="' +
            esc(rx.issued_on || today()) + '"></div>' +
          '<div class="field"><label>' + esc(t('rx_doctor')) + '</label>' +
            '<input class="input" name="doctor" value="' + esc(rx.doctor || '') + '"></div>' +
        '</div>' +
        '<table class="rx"><thead><tr><th></th><th>SPH</th><th>CYL</th><th>AXIS</th><th>ADD</th></tr></thead>' +
        '<tbody>' +
          '<tr><td class="eye">OD</td><td>' + n('od_sph', rx.od_sph) + '</td><td>' + n('od_cyl', rx.od_cyl) +
            '</td><td>' + n('od_axis', rx.od_axis, '1', '0–180') + '</td><td>' + n('od_add', rx.od_add) + '</td></tr>' +
          '<tr><td class="eye">OS</td><td>' + n('os_sph', rx.os_sph) + '</td><td>' + n('os_cyl', rx.os_cyl) +
            '</td><td>' + n('os_axis', rx.os_axis, '1', '0–180') + '</td><td>' + n('os_add', rx.os_add) + '</td></tr>' +
        '</tbody></table>' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('rx_pd')) + '</label>' +
            n('pd', rx.pd, '0.5', '62') + '</div>' +
          '<div class="field"><label>' + esc(t('notes')) + '</label>' +
            '<input class="input" name="notes" value="' + esc(rx.notes || '') + '"></div>' +
        '</div>' +
      '</form>',
    footHtml:
      (rx.id ? '<button class="btn danger" id="delRx">' + esc(t('del')) + '</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="saveRx">' + esc(t('save')) + '</button>'
  });

  $('#saveRx', m.foot).addEventListener('click', function (e) {
    var data = readForm($('#rxForm', m.body));
    data.customer_id = rx.customer_id;
    busy(e.currentTarget, true);
    var op = rx.id
      ? db.from('prescriptions').update(data).eq('id', rx.id)
      : db.from('prescriptions').insert(data);
    guard(op).then(function () {
      toast(t('saved'), 'good'); m.close(); if (done) done();
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });

  if (rx.id) {
    $('#delRx', m.foot).addEventListener('click', function () {
      confirmDelete(function () {
        guard(db.from('prescriptions').delete().eq('id', rx.id)).then(function () {
          toast(t('deleted')); m.close(); if (done) done();
        }).catch(fail);
      });
    });
  }
}

/* a clean A5-ish printout the customer can take away */
function printPrescription(customer, rx) {
  function v(x) { return dpt(x); }
  var w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return;
  w.document.write(
    '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="utf-8">' +
    '<title>' + esc(t('rx_title')) + ' — ' + esc(customer.full_name) + '</title><style>' +
    'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1a18;padding:38px;max-width:640px;margin:0 auto}' +
    'h1{font-size:20px;letter-spacing:.02em}h2{font-size:14px;color:#78766f;font-weight:600;margin-top:4px}' +
    'table{width:100%;border-collapse:collapse;margin:22px 0}' +
    'th,td{border:1px solid #e6e3dc;padding:9px 10px;text-align:center;font-variant-numeric:tabular-nums}' +
    'th{background:#faf9f5;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78766f}' +
    '.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #f27c17;padding-bottom:14px}' +
    '.meta{margin:18px 0;font-size:14px;line-height:1.9}' +
    '.foot{margin-top:34px;font-size:12px;color:#78766f;border-top:1px solid #e6e3dc;padding-top:12px}' +
    '</style></head><body>' +
    '<div class="hdr"><div><h1>MASTER OPTİK</h1><h2>' + esc(t('rx_title')) + '</h2></div>' +
    '<div style="text-align:right;font-size:12px;color:#78766f">Faiq Yusifov küç. 73, Bakı<br>+994 77 745 19 05</div></div>' +
    '<div class="meta"><b>' + esc(customer.full_name) + '</b>' +
      (customer.phone ? ' · ' + esc(formatPhone(customer.phone)) : '') + '<br>' +
      esc(t('rx_issued')) + ': ' + esc(fmtDate(rx.issued_on)) +
      (rx.doctor ? ' · ' + esc(t('rx_doctor')) + ': ' + esc(rx.doctor) : '') + '</div>' +
    '<table><tr><th></th><th>SPH</th><th>CYL</th><th>AXIS</th><th>ADD</th></tr>' +
    '<tr><td><b>OD</b></td><td>' + v(rx.od_sph) + '</td><td>' + v(rx.od_cyl) + '</td><td>' +
      (rx.od_axis != null ? rx.od_axis + '°' : '—') + '</td><td>' + v(rx.od_add) + '</td></tr>' +
    '<tr><td><b>OS</b></td><td>' + v(rx.os_sph) + '</td><td>' + v(rx.os_cyl) + '</td><td>' +
      (rx.os_axis != null ? rx.os_axis + '°' : '—') + '</td><td>' + v(rx.os_add) + '</td></tr>' +
    '</table>' +
    '<div class="meta">PD: <b>' + (rx.pd != null ? esc(rx.pd) + ' mm' : '—') + '</b>' +
      (rx.notes ? '<br>' + esc(rx.notes) : '') + '</div>' +
    '<div class="foot">Master Optik · instagram.com/master__optik</div>' +
    '</body></html>');
  w.document.close();
  setTimeout(function () { w.print(); }, 350);
}

/* =====================================================================
   generic pickers (customer / product)
   ===================================================================== */
function picker(opts) {
  var m = modal({ title: opts.title, foot: false, body:
    '<div class="row">' + searchBox('pickSearch', opts.placeholder, '') + '</div>' +
    '<div id="pickList"><div class="loading"><div class="spinner dark"></div></div></div>' });

  function load(term) {
    opts.query(term).then(function (rows) {
      var box = $('#pickList', m.body);
      if (!rows.length) { box.innerHTML = emptyState(t('nothing')); return; }
      box.innerHTML = '<div class="table-wrap"><table class="tbl"><tbody>' +
        rows.map(function (r, i) {
          return '<tr class="clickable" data-i="' + i + '">' + opts.row(r) + '</tr>';
        }).join('') + '</tbody></table></div>';
      $$('tr[data-i]', box).forEach(function (tr) {
        tr.addEventListener('click', function () {
          m.close(); opts.onPick(rows[Number(tr.dataset.i)]);
        });
      });
    }).catch(fail);
  }

  $('#pickSearch', m.body).addEventListener('input', debounce(function (e) {
    load(e.target.value.trim());
  }, 250));
  load('');
  return m;
}

function pickCustomer(onPick) {
  return picker({
    title: t('ord_pickcus'), placeholder: t('cus_search'),
    query: function (term) {
      var q = db.from('customers').select('id,full_name,phone')
        .order('created_at', { ascending: false }).limit(40);
      if (term) {
        var s = '%' + term.replace(/[,%]/g, '') + '%';
        q = q.or('full_name.ilike.' + s + ',phone.ilike.' + s);
      }
      return guard(q);
    },
    row: function (c) {
      return '<td class="strong">' + esc(c.full_name) + '</td>' +
        '<td class="muted nowrap right">' + esc(formatPhone(c.phone)) + '</td>';
    },
    onPick: onPick
  });
}

function pickProduct(onPick) {
  return picker({
    title: t('ord_pick'), placeholder: t('stk_search'),
    query: function (term) {
      var q = db.from('products').select('id,sku,brand,model,color,qty,sale_price,category')
        .eq('archived', false).order('brand').limit(40);
      if (term) {
        var s = '%' + term.replace(/[,%]/g, '') + '%';
        q = q.or('brand.ilike.' + s + ',model.ilike.' + s + ',sku.ilike.' + s);
      }
      return guard(q);
    },
    row: function (p) {
      return '<td class="strong">' + esc([p.brand, p.model, p.color].filter(Boolean).join(' ')) +
        '<div class="small faint">' + esc(t('cat_' + p.category)) +
        (p.sku ? ' · ' + esc(p.sku) : '') + '</div></td>' +
        '<td class="right nowrap"><span class="badge ' + (num(p.qty) <= 0 ? 'low' : 'ok') + '">' +
        num(p.qty) + '</span></td>' +
        '<td class="right tabular nowrap">' + money(p.sale_price) + '</td>';
    },
    onPick: onPick
  });
}

/* =====================================================================
   10. ORDERS
   ===================================================================== */
VIEWS.orders = function (view) {
  cache.ordStatus = cache.ordStatus || 'open';
  cache.ordQuery = cache.ordQuery || '';

  var filters = [{ id: 'open', label: t('dash_open') }, { id: 'all', label: t('all') }]
    .concat(ORDER_STATUSES.map(function (s) { return { id: s, label: t('st_' + s) }; }));

  view.innerHTML =
    '<div class="row wrap" style="margin-bottom:14px">' +
      searchBox('ordSearch', t('ord_search'), cache.ordQuery) +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="newOrd">' + ico('plus') + esc(t('ord_new')) + '</button>' +
    '</div>' +
    '<div class="chips" style="margin-bottom:16px" id="ordChips">' +
      filters.map(function (f) {
        return '<button class="chip' + (f.id === cache.ordStatus ? ' active' : '') +
          '" data-f="' + f.id + '">' + esc(f.label) + '</button>';
      }).join('') +
    '</div>' +
    '<div class="card"><div class="body flush" id="ordList">' +
      '<div class="loading"><div class="spinner dark"></div></div></div></div>';

  $('#newOrd').addEventListener('click', function () { editOrder(null, load); });
  $('#ordChips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    cache.ordStatus = b.dataset.f;
    $$('#ordChips .chip').forEach(function (c) { c.classList.toggle('active', c === b); });
    load();
  });
  $('#ordSearch').addEventListener('input', debounce(function (e) {
    cache.ordQuery = e.target.value.trim(); load();
  }, 260));

  function load() {
    var q = db.from('orders_view').select('*')
      .order('created_at', { ascending: false }).limit(300);
    if (cache.ordStatus === 'open') q = q.in('status', ['new', 'ordered', 'in_lab', 'ready']);
    else if (cache.ordStatus !== 'all') q = q.eq('status', cache.ordStatus);
    if (cache.ordQuery) {
      var s = '%' + cache.ordQuery.replace(/[,%]/g, '') + '%';
      q = q.or('code.ilike.' + s + ',customer_name.ilike.' + s + ',customer_phone.ilike.' + s);
    }
    return guard(q).then(function (rows) {
      var box = $('#ordList');
      box.innerHTML = ordersTable(rows || [], false);
      $$('tr[data-order]', box).forEach(function (tr) {
        tr.addEventListener('click', function () { openOrder(tr.dataset.order, load); });
      });
      refreshBadges();
    }).catch(fail);
  }

  return load();
};

function openOrder(id, done) {
  var m = modal({ side: true, title: t('ord_title'), foot: false,
    body: '<div class="loading"><div class="spinner dark"></div></div>' });

  function load() {
    return Promise.all([
      guard(db.from('orders_view').select('*').eq('id', id).single()),
      guard(db.from('order_items').select('*').eq('order_id', id).order('id'))
    ]).then(function (r) { render(r[0], r[1] || []); }).catch(fail);
  }

  function render(o, items) {
    $('.m-head h3', m.el).textContent = o.code;
    var sub = $('.m-head .sub', m.el);
    if (!sub) {
      sub = document.createElement('div'); sub.className = 'sub';
      $('.m-head div', m.el).appendChild(sub);
    }
    sub.textContent = o.customer_name || '—';

    m.body.innerHTML =
      '<div class="row wrap">' +
        statusBadge(o.status) +
        (o.promised_on ? '<span class="small muted">' + esc(t('ord_promised')) + ': <b>' +
          esc(fmtDate(o.promised_on)) + '</b></span>' : '') +
        '<span class="spacer"></span>' +
        '<button class="btn sm" id="oEdit">' + ico('edit') + esc(t('edit')) + '</button>' +
      '</div>' +

      '<div class="field"><label>' + esc(t('status')) + '</label>' +
        '<select class="select" id="oStatus">' + selectOptions(ORDER_STATUSES, 'st_', o.status) +
        '</select></div>' +

      '<div class="card" style="box-shadow:none"><div class="body flush">' +
        '<div class="table-wrap"><table class="tbl"><thead><tr>' +
          '<th>' + esc(t('ord_desc')) + '</th><th class="right">' + esc(t('qty')) + '</th>' +
          '<th class="right">' + esc(t('ord_unit')) + '</th>' +
          '<th class="right">' + esc(t('total')) + '</th></tr></thead><tbody>' +
        (items.length ? items.map(function (it) {
          return '<tr><td>' + esc(it.description) + '</td>' +
            '<td class="right tabular">' + num(it.qty) + '</td>' +
            '<td class="right tabular nowrap">' + money(it.unit_price) + '</td>' +
            '<td class="right tabular nowrap strong">' + money(it.line_total) + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="muted center">' + esc(t('nothing')) + '</td></tr>') +
        '</tbody></table></div></div></div>' +

      '<div class="stack" style="gap:6px">' +
        totalRow(t('ord_items'), money(o.items_total)) +
        (num(o.discount) ? totalRow(t('ord_disc'), '− ' + money(o.discount)) : '') +
        totalRow('<b>' + esc(t('total')) + '</b>', '<b>' + money(o.total) + '</b>') +
        totalRow(t('ord_paid'), money(o.paid)) +
        totalRow('<b>' + esc(t('ord_balance')) + '</b>',
          '<b style="color:' + (num(o.balance) > 0 ? 'var(--red)' : 'var(--green)') + '">' +
          money(o.balance) + '</b>') +
      '</div>' +

      (o.notes ? '<div class="notice info">' + ico('info') + '<div>' + esc(o.notes) + '</div></div>' : '') +
      '<div class="small faint">' + esc(fmtDateTime(o.created_at)) + '</div>';

    $('#oEdit', m.body).addEventListener('click', function () {
      editOrder(o, function () { load(); if (done) done(); });
    });

    $('#oStatus', m.body).addEventListener('change', function (e) {
      setOrderStatus(o, items, e.target.value).then(function () {
        toast(t('saved'), 'good'); load(); if (done) done();
      }).catch(function (err) { fail(err); load(); });
    });
  }

  load();
}

function totalRow(label, value) {
  return '<div class="row" style="justify-content:space-between">' +
    '<span class="muted">' + label + '</span>' +
    '<span class="tabular">' + value + '</span></div>';
}

/* Delivering an order takes its stock lines out of the warehouse — once. */
function setOrderStatus(order, items, status) {
  var patch = { status: status };
  if (status === 'delivered') patch.delivered_at = new Date().toISOString();

  return guard(db.from('orders').update(patch).eq('id', order.id)).then(function () {
    if (status !== 'delivered') return null;
    return guard(db.from('stock_moves').select('id').eq('order_id', order.id).limit(1))
      .then(function (existing) {
        if (existing && existing.length) return null;   /* already deducted */
        var lines = items.filter(function (i) { return i.product_id; });
        if (!lines.length) return null;
        return Promise.all(lines.map(function (line) {
          return guard(db.from('products').select('qty').eq('id', line.product_id).single())
            .then(function (p) {
              return guard(db.from('products')
                .update({ qty: num(p.qty) - num(line.qty) })
                .eq('id', line.product_id));
            })
            .then(function () {
              return guard(db.from('stock_moves').insert({
                product_id: line.product_id, delta: -num(line.qty),
                reason: 'order ' + order.code, order_id: order.id
              }));
            });
        }));
      });
  }).then(function () { refreshBadges(); });
}

function editOrder(order, done) {
  var o = order || {};
  var items = [];
  var chosen = { id: o.customer_id || null, name: o.customer_name || '' };

  var m = modal({
    title: o.id ? o.code : t('ord_new'),
    body:
      '<form id="ordForm" class="stack">' +
        '<div class="field"><label>' + esc(t('ord_customer')) + '</label>' +
          '<div class="row"><button type="button" class="btn" id="pickCus" style="flex:1;justify-content:flex-start">' +
            ico('users') + '<span id="cusName">' + esc(chosen.name || t('ord_pickcus')) + '</span>' +
          '</button></div></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('status')) + '</label>' +
            '<select class="select" name="status">' +
            selectOptions(ORDER_STATUSES, 'st_', o.status || 'new') + '</select></div>' +
          '<div class="field"><label>' + esc(t('ord_promised')) + '</label>' +
            '<input class="input" type="date" name="promised_on" value="' +
            esc(o.promised_on || '') + '"></div>' +
        '</div>' +

        '<div class="section-label">' + esc(t('ord_items')) + '</div>' +
        '<div id="itemRows" class="stack" style="gap:8px"></div>' +
        '<div class="row">' +
          '<button type="button" class="btn sm" id="addLine">' + ico('plus') + esc(t('ord_additem')) + '</button>' +
          '<button type="button" class="btn sm" id="addStock">' + ico('box') + esc(t('ord_pick')) + '</button>' +
          '<span class="spacer"></span>' +
          '<span class="tabular strong" id="sumLine">' + money(0) + '</span>' +
        '</div>' +
        '<div class="small faint">' + esc(t('ord_stockmsg')) + '</div>' +

        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('ord_disc')) + '</label>' +
            '<input class="input" type="number" step="0.01" name="discount" data-num="1" value="' +
            esc(o.discount != null ? o.discount : 0) + '"></div>' +
          '<div class="field"><label>' + esc(t('ord_paid')) + '</label>' +
            '<input class="input" type="number" step="0.01" name="paid" data-num="1" value="' +
            esc(o.paid != null ? o.paid : 0) + '"></div>' +
        '</div>' +
        '<div class="field"><label>' + esc(t('notes')) + '</label>' +
          '<textarea class="textarea" name="notes">' + esc(o.notes || '') + '</textarea></div>' +
      '</form>',
    footHtml:
      (o.id ? '<button class="btn danger" id="delOrd">' + esc(t('del')) + '</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="saveOrd">' + esc(t('save')) + '</button>'
  });

  function lineRow(item, idx) {
    return '<div class="row" data-line="' + idx + '" style="gap:6px;align-items:flex-start">' +
      '<input class="input" data-k="description" placeholder="' + esc(t('ord_desc')) + '" ' +
        'value="' + esc(item.description || '') + '" style="flex:3">' +
      '<input class="input tabular" data-k="qty" type="number" min="1" step="1" ' +
        'value="' + num(item.qty || 1) + '" style="flex:0 0 70px" aria-label="' + esc(t('qty')) + '">' +
      '<input class="input tabular" data-k="unit_price" type="number" min="0" step="0.01" ' +
        'value="' + num(item.unit_price || 0) + '" style="flex:0 0 110px" aria-label="' + esc(t('price')) + '">' +
      '<button type="button" class="btn icon ghost" data-rm="' + idx + '">' + ico('trash') + '</button>' +
      '</div>';
  }

  function paintLines() {
    $('#itemRows', m.body).innerHTML = items.map(lineRow).join('') ||
      '<div class="small muted">' + esc(t('nothing')) + '</div>';
    $$('#itemRows [data-rm]', m.body).forEach(function (b) {
      b.addEventListener('click', function () {
        items.splice(Number(b.dataset.rm), 1); paintLines();
      });
    });
    $$('#itemRows [data-line]', m.body).forEach(function (row) {
      var idx = Number(row.dataset.line);
      $$('[data-k]', row).forEach(function (inp) {
        inp.addEventListener('input', function () {
          var v = inp.value;
          items[idx][inp.dataset.k] = inp.dataset.k === 'description' ? v : Number(v || 0);
          paintSum();
        });
      });
    });
    paintSum();
  }

  function paintSum() {
    var sum = items.reduce(function (s, i) { return s + num(i.qty) * num(i.unit_price); }, 0);
    $('#sumLine', m.body).textContent = money(sum);
  }

  $('#pickCus', m.body).addEventListener('click', function () {
    pickCustomer(function (c) {
      chosen = { id: c.id, name: c.full_name };
      $('#cusName', m.body).textContent = c.full_name;
    });
  });

  $('#addLine', m.body).addEventListener('click', function () {
    items.push({ description: '', qty: 1, unit_price: 0 }); paintLines();
  });

  $('#addStock', m.body).addEventListener('click', function () {
    pickProduct(function (p) {
      items.push({
        product_id: p.id,
        description: [p.brand, p.model, p.color].filter(Boolean).join(' ') || p.sku,
        qty: 1, unit_price: num(p.sale_price)
      });
      paintLines();
    });
  });

  $('#saveOrd', m.foot).addEventListener('click', function (e) {
    var form = $('#ordForm', m.body);
    if (!form.reportValidity()) return;
    var data = readForm(form);
    data.customer_id = chosen.id;
    data.discount = num(data.discount);
    data.paid = num(data.paid);
    var clean = items.filter(function (i) { return (i.description || '').trim(); });
    busy(e.currentTarget, true);

    var save = o.id
      ? guard(db.from('orders').update(data).eq('id', o.id)).then(function () { return o.id; })
      : guard(db.from('orders').insert(data).select('id').single())
          .then(function (row) { return row.id; });

    save.then(function (orderId) {
      return guard(db.from('order_items').delete().eq('order_id', orderId)).then(function () {
        if (!clean.length) return null;
        return guard(db.from('order_items').insert(clean.map(function (i) {
          return {
            order_id: orderId, product_id: i.product_id || null,
            description: i.description, qty: num(i.qty) || 1, unit_price: num(i.unit_price)
          };
        })));
      });
    }).then(function () {
      toast(t('saved'), 'good'); m.close(); refreshBadges(); if (done) done();
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });

  if (o.id) {
    $('#delOrd', m.foot).addEventListener('click', function () {
      confirmDelete(function () {
        guard(db.from('orders').delete().eq('id', o.id)).then(function () {
          toast(t('deleted')); m.close(); if (done) done();
        }).catch(fail);
      });
    });
    guard(db.from('order_items').select('*').eq('order_id', o.id).order('id'))
      .then(function (rows) {
        items = (rows || []).map(function (r) {
          return { product_id: r.product_id, description: r.description,
                   qty: num(r.qty), unit_price: num(r.unit_price) };
        });
        paintLines();
      }).catch(fail);
  } else {
    paintLines();
  }
}

/* =====================================================================
   11. STOCK
   ===================================================================== */
VIEWS.stock = function (view) {
  cache.stkQuery = cache.stkQuery || '';
  cache.stkCat = cache.stkCat || 'all';
  cache.stkLow = cache.stkLow || false;

  view.innerHTML =
    '<div class="row wrap" style="margin-bottom:14px">' +
      searchBox('stkSearch', t('stk_search'), cache.stkQuery) +
      '<select class="select" id="stkCat" style="max-width:200px">' +
        '<option value="all">' + esc(t('all')) + '</option>' +
        selectOptions(CATEGORIES, 'cat_', cache.stkCat) +
      '</select>' +
      '<button class="chip' + (cache.stkLow ? ' active' : '') + '" id="stkLow">' +
        esc(t('stk_low')) + '</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="newProd">' + ico('plus') + esc(t('stk_new')) + '</button>' +
    '</div>' +
    '<div class="row wrap" style="margin-bottom:14px" id="stkSummary"></div>' +
    '<div class="card"><div class="body flush" id="stkList">' +
      '<div class="loading"><div class="spinner dark"></div></div></div></div>';

  $('#stkCat').value = cache.stkCat;
  $('#newProd').addEventListener('click', function () { editProduct(null, load); });
  $('#stkCat').addEventListener('change', function (e) { cache.stkCat = e.target.value; load(); });
  $('#stkLow').addEventListener('click', function (e) {
    cache.stkLow = !cache.stkLow;
    e.currentTarget.classList.toggle('active', cache.stkLow);
    load();
  });
  $('#stkSearch').addEventListener('input', debounce(function (e) {
    cache.stkQuery = e.target.value.trim(); load();
  }, 260));

  function load() {
    var q = db.from('products').select('*').eq('archived', false)
      .order('brand', { ascending: true }).limit(1000);
    if (cache.stkCat !== 'all') q = q.eq('category', cache.stkCat);
    if (cache.stkQuery) {
      var s = '%' + cache.stkQuery.replace(/[,%]/g, '') + '%';
      q = q.or('brand.ilike.' + s + ',model.ilike.' + s + ',sku.ilike.' + s + ',color.ilike.' + s);
    }
    return guard(q).then(function (rows) {
      rows = rows || [];
      var lowRows = rows.filter(function (p) { return num(p.qty) <= num(p.min_qty); });
      var shown = cache.stkLow ? lowRows : rows;

      $('#stkSummary').innerHTML =
        '<span class="chip" style="cursor:default">' + esc(t('total')) + ': <b>' + rows.length + '</b></span>' +
        '<span class="chip" style="cursor:default">' + esc(t('qty')) + ': <b>' +
          rows.reduce(function (s, p) { return s + num(p.qty); }, 0) + ' ' +
          esc(t('dash_pieces')) + '</b></span>' +
        '<span class="chip" style="cursor:default">' + esc(t('stk_value')) + ': <b>' +
          money(rows.reduce(function (s, p) { return s + num(p.qty) * num(p.sale_price); }, 0)) + '</b></span>' +
        (lowRows.length ? '<span class="badge low">' + esc(t('stk_lowbadge')) + ': ' +
          lowRows.length + '</span>' : '');

      var box = $('#stkList');
      if (!shown.length) { box.innerHTML = emptyState(t('stk_none')); return; }
      box.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' +
        '<th>' + esc(t('stk_brand')) + ' / ' + esc(t('stk_model')) + '</th>' +
        '<th class="hide-sm">' + esc(t('stk_cat')) + '</th>' +
        '<th class="hide-sm">' + esc(t('stk_sku')) + '</th>' +
        '<th class="center">' + esc(t('qty')) + '</th>' +
        '<th class="right hide-sm">' + esc(t('stk_cost')) + '</th>' +
        '<th class="right">' + esc(t('stk_sale')) + '</th>' +
        '<th></th></tr></thead><tbody>' +
        shown.map(function (p) {
          var low = num(p.qty) <= num(p.min_qty);
          return '<tr data-id="' + esc(p.id) + '">' +
            '<td class="strong clickable" data-open="1">' +
              esc([p.brand, p.model].filter(Boolean).join(' ') || '—') +
              (p.color ? '<div class="small faint">' + esc(p.color) +
                (p.size ? ' · ' + esc(p.size) : '') + '</div>' : '') + '</td>' +
            '<td class="hide-sm muted">' + esc(t('cat_' + p.category)) + '</td>' +
            '<td class="hide-sm faint small">' + esc(p.sku || '—') + '</td>' +
            '<td class="center nowrap">' +
              '<button class="btn icon ghost sm" data-adj="-1" title="−1">' + ico('minus') + '</button>' +
              '<span class="badge ' + (low ? 'low' : 'ok') + '" style="margin:0 4px">' + num(p.qty) + '</span>' +
              '<button class="btn icon ghost sm" data-adj="1" title="+1">' + ico('plus') + '</button>' +
            '</td>' +
            '<td class="right tabular hide-sm muted nowrap">' + money(p.cost_price) + '</td>' +
            '<td class="right tabular nowrap strong">' + money(p.sale_price) + '</td>' +
            '<td class="right"><button class="btn icon ghost" data-edit="1">' + ico('edit') + '</button></td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';

      $$('#stkList tr[data-id]', box).forEach(function (tr) {
        var p = shown.filter(function (x) { return x.id === tr.dataset.id; })[0];
        $$('[data-adj]', tr).forEach(function (b) {
          b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            adjustStock(p, Number(b.dataset.adj), load);
          });
        });
        var openCell = $('[data-open]', tr), editBtn = $('[data-edit]', tr);
        if (openCell) openCell.addEventListener('click', function () { editProduct(p, load); });
        if (editBtn) editBtn.addEventListener('click', function () { editProduct(p, load); });
      });
      refreshBadges();
    }).catch(fail);
  }

  return load();
};

function adjustStock(product, delta, done) {
  var next = num(product.qty) + delta;
  if (next < 0) next = 0;
  guard(db.from('products').update({ qty: next }).eq('id', product.id))
    .then(function () {
      return guard(db.from('stock_moves').insert({
        product_id: product.id, delta: delta, reason: delta > 0 ? 'manual +' : 'manual −'
      }));
    })
    .then(function () { if (done) done(); })
    .catch(fail);
}

function editProduct(product, done) {
  var p = product || {};
  var m = modal({
    title: p.id ? [p.brand, p.model].filter(Boolean).join(' ') || t('edit') : t('stk_new'),
    body:
      '<form id="prodForm" class="stack">' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('stk_brand')) + '</label>' +
            '<input class="input" name="brand" value="' + esc(p.brand || '') + '"></div>' +
          '<div class="field"><label>' + esc(t('stk_model')) + '</label>' +
            '<input class="input" name="model" value="' + esc(p.model || '') + '"></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="field"><label>' + esc(t('stk_cat')) + '</label>' +
            '<select class="select" name="category">' +
            selectOptions(CATEGORIES, 'cat_', p.category || 'frame') + '</select></div>' +
          '<div class="field"><label>' + esc(t('stk_color')) + '</label>' +
            '<input class="input" name="color" value="' + esc(p.color || '') + '"></div>' +
          '<div class="field"><label>' + esc(t('stk_size')) + '</label>' +
            '<input class="input" name="size" value="' + esc(p.size || '') + '"></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="field"><label>' + esc(t('stk_cost')) + '</label>' +
            '<input class="input" type="number" step="0.01" min="0" data-num="1" name="cost_price" value="' +
            esc(p.cost_price != null ? p.cost_price : 0) + '"></div>' +
          '<div class="field"><label>' + esc(t('stk_sale')) + '</label>' +
            '<input class="input" type="number" step="0.01" min="0" data-num="1" name="sale_price" value="' +
            esc(p.sale_price != null ? p.sale_price : 0) + '"></div>' +
          '<div class="field"><label>' + esc(t('stk_sku')) + '</label>' +
            '<input class="input" name="sku" value="' + esc(p.sku || '') + '"></div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>' + esc(t('qty')) + '</label>' +
            '<input class="input" type="number" step="1" min="0" data-num="1" name="qty" value="' +
            esc(p.qty != null ? p.qty : 0) + '"></div>' +
          '<div class="field"><label>' + esc(t('stk_min')) + '</label>' +
            '<input class="input" type="number" step="1" min="0" data-num="1" name="min_qty" value="' +
            esc(p.min_qty != null ? p.min_qty : 1) + '"></div>' +
        '</div>' +
        '<div class="field"><label>' + esc(t('notes')) + '</label>' +
          '<textarea class="textarea" name="notes">' + esc(p.notes || '') + '</textarea></div>' +
      '</form>',
    footHtml:
      (p.id ? '<button class="btn danger" id="delProd">' + esc(t('stk_archive')) + '</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="saveProd">' + esc(t('save')) + '</button>'
  });

  $('#saveProd', m.foot).addEventListener('click', function (e) {
    var form = $('#prodForm', m.body);
    if (!form.reportValidity()) return;
    var data = readForm(form);
    ['cost_price', 'sale_price', 'qty', 'min_qty'].forEach(function (k) { data[k] = num(data[k]); });
    busy(e.currentTarget, true);
    var op = p.id
      ? db.from('products').update(data).eq('id', p.id)
      : db.from('products').insert(data);
    guard(op).then(function () {
      toast(t('saved'), 'good'); m.close(); if (done) done();
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });

  if (p.id) {
    $('#delProd', m.foot).addEventListener('click', function () {
      guard(db.from('products').update({ archived: true }).eq('id', p.id)).then(function () {
        toast(t('saved')); m.close(); if (done) done();
      }).catch(fail);
    });
  }
}

/* =====================================================================
   12. INSTAGRAM
   The panel talks to the Instagram Graph API directly from the browser
   with the long-lived token the owner pastes in. Posts are copied into
   Supabase so the public website never needs a token — and the images
   are mirrored into Storage because Instagram's own media URLs expire.
   ===================================================================== */
var IG_GRAPH = 'https://graph.instagram.com';

function igGetSetting() {
  return guard(db.from('settings').select('value').eq('key', 'instagram').maybeSingle())
    .then(function (row) { return (row && row.value) || {}; });
}

function igSaveSetting(value) {
  return guard(db.from('settings').upsert({ key: 'instagram', value: value }, { onConflict: 'key' }));
}

/* Instagram long-lived tokens last 60 days and can be refreshed once a
   day. Doing it on every visit means the owner never has to think. */
function igAutoRefreshToken() {
  igGetSetting().then(function (s) {
    if (!s.token) return;
    var last = s.refreshed_at ? new Date(s.refreshed_at).getTime() : 0;
    if (Date.now() - last < 5 * 86400000) return;      /* at most every 5 days */
    return fetch(IG_GRAPH + '/refresh_access_token?grant_type=ig_refresh_token&access_token=' +
      encodeURIComponent(s.token))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.access_token) return;
        s.token = j.access_token;
        s.refreshed_at = new Date().toISOString();
        return igSaveSetting(s);
      });
  }).catch(function () { /* silent — the panel still works without it */ });
}

VIEWS.instagram = function (view) {
  var settings = {};

  function load() {
    return Promise.all([
      igGetSetting(),
      guard(db.from('instagram_posts').select('*')
              .order('sort_order', { ascending: true })
              .order('posted_at', { ascending: false }).limit(60))
    ]).then(function (r) { settings = r[0] || {}; render(r[1] || []); });
  }

  function render(posts) {
    var visible = posts.filter(function (p) { return !p.hidden; }).length;
    view.innerHTML =
      '<div class="notice info" style="margin-bottom:16px">' + ico('info') +
        '<div>' + esc(t('ig_desc')) + ' <a href="guide.html#instagram" target="_blank" rel="noopener">' +
        esc(t('ig_howto')) + '</a></div></div>' +

      '<div class="card" style="margin-bottom:18px"><div class="head">' +
        '<h2>' + esc(t('ig_connect')) + '</h2>' +
        '<span class="spacer"></span>' +
        '<span class="small faint">' + esc(t('ig_last')) + ': ' +
          esc(settings.synced_at ? fmtDateTime(settings.synced_at) : t('ig_never')) + '</span>' +
      '</div><div class="body stack">' +
        '<div class="field"><label>' + esc(t('ig_token')) + '</label>' +
          '<textarea class="textarea" id="igToken" rows="2" spellcheck="false" ' +
            'placeholder="IGQVJ…">' + esc(settings.token || '') + '</textarea>' +
          '<div class="small faint">' + esc(t('ig_expiry')) + ' ' +
            esc(t('ig_autosync')) + '</div></div>' +
        '<div class="row wrap">' +
          '<button class="btn" id="igSave">' + esc(t('save')) + '</button>' +
          '<button class="btn primary" id="igSync">' + ico('sync') + esc(t('ig_sync')) + '</button>' +
          '<button class="btn ghost sm" id="igManual">' + esc(t('ig_manual')) + '</button>' +
          '<span class="spacer"></span>' +
          '<span class="small muted">' + visible + ' ' + esc(t('ig_visible')) + '</span>' +
        '</div>' +
      '</div></div>' +

      (posts.length
        ? '<div class="ig-grid">' + posts.map(igCard).join('') + '</div>'
        : '<div class="card"><div class="body">' + emptyState(t('ig_none')) + '</div></div>');

    $('#igSave').addEventListener('click', function (e) {
      settings.token = $('#igToken').value.trim();
      busy(e.currentTarget, true);
      igSaveSetting(settings).then(function () {
        busy(e.currentTarget, false); toast(t('ig_saved'), 'good');
      }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
    });

    $('#igSync').addEventListener('click', function (e) {
      var token = $('#igToken').value.trim();
      if (!token) { toast(t('ig_tokenmiss'), 'err'); return; }
      settings.token = token;
      busy(e.currentTarget, true);
      igSync(token, settings)
        .then(function (n) {
          busy(e.currentTarget, false);
          toast(n + ' ' + t('ig_got'), 'good');
          load();
        })
        .catch(function (err) { busy(e.currentTarget, false); fail(err); });
    });

    $('#igManual').addEventListener('click', function () {
      settings.token = $('#igToken').value.trim();
      igManualImport(settings, load);
    });

    $$('[data-ig]', view).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var post = posts.filter(function (p) { return p.id === btn.dataset.ig; })[0];
        var act = btn.dataset.act;
        if (act === 'toggle') {
          guard(db.from('instagram_posts').update({ hidden: !post.hidden }).eq('id', post.id))
            .then(load).catch(fail);
        } else if (act === 'up' || act === 'down') {
          var idx = posts.indexOf(post);
          var swap = posts[act === 'up' ? idx - 1 : idx + 1];
          if (!swap) return;
          var a = num(post.sort_order), b = num(swap.sort_order);
          if (a === b) { a = idx; b = posts.indexOf(swap); }
          Promise.all([
            guard(db.from('instagram_posts').update({ sort_order: b }).eq('id', post.id)),
            guard(db.from('instagram_posts').update({ sort_order: a }).eq('id', swap.id))
          ]).then(load).catch(fail);
        }
      });
    });
  }

  return load();
};

function igCard(p) {
  var img = safeUrl(p.stored_url) || safeUrl(p.thumbnail_url) || safeUrl(p.media_url) || '';
  var permalink = safeUrl(p.permalink) || 'https://instagram.com/master__optik';
  var typeLabel = p.media_type === 'VIDEO' ? t('ig_video')
    : p.media_type === 'CAROUSEL_ALBUM' ? t('ig_album') : '';
  return '<div class="ig-card' + (p.hidden ? ' hidden-post' : '') + '">' +
    '<div class="ph" style="background-image:url(' + esc(img).replace(/[()]/g, '') + ')">' +
      (typeLabel ? '<span class="type">' + esc(typeLabel) + '</span>' : '') +
      (p.hidden ? '<span class="type" style="left:auto;right:8px;background:#cf3a3a">' +
        esc(t('ig_hidden')) + '</span>' : '') +
    '</div>' +
    '<div class="cap">' + esc((p.caption || '').slice(0, 120)) + '</div>' +
    '<div class="acts">' +
      '<button class="btn icon ghost" data-ig="' + esc(p.id) + '" data-act="toggle" title="' +
        esc(p.hidden ? t('ig_show') : t('ig_hide')) + '">' + ico(p.hidden ? 'eyeoff' : 'eye') + '</button>' +
      '<button class="btn icon ghost" data-ig="' + esc(p.id) + '" data-act="up" title="' +
        esc(t('ig_up')) + '">' + ico('up') + '</button>' +
      '<button class="btn icon ghost" data-ig="' + esc(p.id) + '" data-act="down" title="' +
        esc(t('ig_down')) + '">' + ico('down') + '</button>' +
      '<span class="spacer"></span>' +
      '<a class="btn icon ghost" href="' + esc(permalink) + '" target="_blank" rel="noopener" ' +
        'title="' + esc(t('open')) + '">' + ico('ext') + '</a>' +
    '</div></div>';
}

function igSync(token, settings) {
  var fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
  return fetch(IG_GRAPH + '/me/media?fields=' + fields + '&limit=30&access_token=' +
               encodeURIComponent(token))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.error) throw new Error(j.error.message || 'Instagram API error');
      return igStore(j, token, settings);
    });
}

/* Only http(s) links ever reach the website's gallery. The media comes back
   from the Graph API, but it can also be pasted by hand into the manual
   import box, and these values end up in href/src attributes on the public
   site — a javascript: URL there would be stored XSS against every visitor. */
function safeUrl(value) {
  if (!value) return null;
  var v = String(value).trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

function igStore(j, token, settings) {
  var media = (j && j.data) || [];
  if (!media.length) return Promise.resolve(0);

  /* The owner can reorder and hide posts by hand. A re-sync must not undo
     that, so sort_order is written for genuinely new posts only. */
  return guard(db.from('instagram_posts').select('id,sort_order'))
    .catch(function () { return []; })
    .then(function (existing) {
      var known = {};
      var maxOrder = -1;
      (existing || []).forEach(function (r) {
        known[r.id] = true;
        if (num(r.sort_order) > maxOrder) maxOrder = num(r.sort_order);
      });

      var now = new Date().toISOString();
      var fresh = 0;
      var rows = media.map(function (p) {
        var row = {
          id: p.id,
          permalink: safeUrl(p.permalink) || 'https://instagram.com/master__optik',
          media_type: p.media_type || null,
          media_url: safeUrl(p.media_url),
          thumbnail_url: safeUrl(p.thumbnail_url),
          caption: p.caption || null,
          posted_at: p.timestamp || null,
          synced_at: now
        };
        if (!known[p.id]) row.sort_order = maxOrder + 1 + (fresh++);
        return row;
      });

      return guard(db.from('instagram_posts').upsert(rows, { onConflict: 'id' }))
        .then(function () { return igMirror(media); })
        .then(function () {
          settings.synced_at = now;
          if (token) settings.token = token;
          return igSaveSetting(settings);
        })
        .then(function () { return rows.length; });
    });
}

/* Fallback when the browser refuses the cross-origin call: the owner opens
   the API URL in a tab and pastes the JSON back in. */
function igManualImport(settings, done) {
  var url = IG_GRAPH + '/me/media?fields=id,caption,media_type,media_url,permalink,' +
    'thumbnail_url,timestamp&limit=30&access_token=' + encodeURIComponent(settings.token || '');
  var m = modal({
    title: t('ig_manual'),
    body:
      '<p class="small muted">' + esc(t('ig_manual_d')) + '</p>' +
      '<div class="row">' +
        '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' +
          esc(t('ig_openlink')) + '</a></div>' +
      '<div class="field"><label>' + esc(t('ig_paste')) + '</label>' +
        '<textarea class="textarea" id="igJson" rows="7" spellcheck="false" ' +
        'placeholder=\'{"data":[…]}\'></textarea></div>',
    footHtml: '<span class="spacer"></span>' +
      '<button class="btn" data-close>' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="igDoImport">' + esc(t('ig_import')) + '</button>'
  });
  $('#igDoImport', m.foot).addEventListener('click', function (e) {
    var raw = $('#igJson', m.body).value.trim();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (err) { return toast(t('err'), 'err'); }
    busy(e.currentTarget, true);
    igStore(parsed, settings.token, settings).then(function (n) {
      m.close(); toast(n + ' ' + t('ig_got'), 'good'); if (done) done();
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });
}

/* keeps the website gallery fresh: Instagram's own media URLs expire, so a
   daily re-sync on panel open is enough to keep the images alive */
function igAutoSync() {
  igGetSetting().then(function (s) {
    if (!s || !s.token) return;
    var last = s.synced_at ? new Date(s.synced_at).getTime() : 0;
    if (Date.now() - last < 12 * 3600000) return;
    return igSync(s.token, s);
  }).catch(function () {});
}

/* Instagram CDN links expire — keep our own copy in Supabase Storage.
   Best effort: if the browser is not allowed to read the image bytes we
   simply keep the (temporary) Instagram URL. */
function igMirror(media) {
  return guard(db.from('instagram_posts').select('id,stored_url')).then(function (existing) {
    var have = {};
    (existing || []).forEach(function (r) { if (r.stored_url) have[r.id] = true; });
    var todo = media.filter(function (p) { return !have[p.id]; }).slice(0, 12);
    if (!todo.length) return null;

    return todo.reduce(function (chain, p) {
      return chain.then(function () {
        var src = safeUrl(p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url);
        if (!src) return null;
        return fetch(src)
          .then(function (r) { if (!r.ok) throw new Error('fetch'); return r.blob(); })
          .then(function (blob) {
            var path = p.id + '.jpg';
            return db.storage.from('instagram')
              .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
              .then(function (res) {
                if (res.error) throw res.error;
                var pub = db.storage.from('instagram').getPublicUrl(path);
                return guard(db.from('instagram_posts')
                  .update({ stored_url: pub.data.publicUrl }).eq('id', p.id));
              });
          })
          .catch(function () { return null; });   /* keep the IG url */
      });
    }, Promise.resolve());
  });
}

/* =====================================================================
   13. SITE CONTENT  (what the public website says)
   ===================================================================== */
var CONTENT_GROUPS = ['hero', 'services', 'gallery', 'about', 'contact', 'general'];

VIEWS.content = function (view) {
  cache.cntLang = cache.cntLang || lang;
  var rows = [], dirty = {};

  function load() {
    return guard(db.from('site_content').select('*')
      .order('group_name').order('sort_order')).then(function (r) {
        rows = r || []; render();
        obGet().then(function (state) {
          if (state.content_seen) return;
          state.content_seen = true;
          obSave(state);
        });
      });
  }

  function render() {
    var groups = {};
    rows.forEach(function (r) {
      var g = r.group_name || 'general';
      (groups[g] = groups[g] || []).push(r);
    });

    view.innerHTML =
      '<div class="notice info" style="margin-bottom:16px">' + ico('info') +
        '<div>' + esc(t('cnt_desc')) + '</div></div>' +
      '<div class="row" style="margin-bottom:16px;position:sticky;top:66px;z-index:10">' +
        '<div class="langtabs" id="cntLangs">' +
          ['az', 'ru', 'en'].map(function (l) {
            return '<button data-l="' + l + '"' +
              (l === cache.cntLang ? ' class="active"' : '') + '>' + l.toUpperCase() + '</button>';
          }).join('') +
        '</div>' +
        '<span class="spacer"></span>' +
        '<span class="small muted" id="dirtyCount"></span>' +
        '<button class="btn primary" id="cntSave">' + esc(t('cnt_saveall')) + '</button>' +
      '</div>' +
      CONTENT_GROUPS.filter(function (g) { return groups[g]; }).map(function (g) {
        return '<div class="card" style="margin-bottom:16px">' +
          '<div class="head"><h2>' + esc(t('cnt_' + g) || g) + '</h2></div>' +
          '<div class="body">' +
            groups[g].map(function (r) {
              var val = r[cache.cntLang] || '';
              var long = val.length > 70;
              return '<div class="cms-row">' +
                '<div class="k"><b>' + esc(prettyKey(r.key)) + '</b><code>' + esc(r.key) + '</code></div>' +
                '<div>' + (long
                  ? '<textarea class="textarea" data-key="' + esc(r.key) + '" rows="3">' + esc(val) + '</textarea>'
                  : '<input class="input" data-key="' + esc(r.key) + '" value="' + esc(val) + '">') +
                '</div></div>';
            }).join('') +
          '</div></div>';
      }).join('');

    $$('#cntLangs button').forEach(function (b) {
      b.addEventListener('click', function () {
        /* edits stay in `rows` + `dirty`, so switching tabs loses nothing */
        cache.cntLang = b.dataset.l; render();
      });
    });

    $$('[data-key]', view).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var row = rows.filter(function (r) { return r.key === inp.dataset.key; })[0];
        if (!row) return;
        row[cache.cntLang] = inp.value;
        dirty[inp.dataset.key] = true;
        $('#dirtyCount').textContent = Object.keys(dirty).length + ' ' + t('cnt_changed');
      });
    });

    $('#cntSave').addEventListener('click', function (e) {
      var keys = Object.keys(dirty);
      if (!keys.length) { toast(t('saved'), 'good'); return; }
      busy(e.currentTarget, true);
      var payload = keys.map(function (k) {
        var r = rows.filter(function (x) { return x.key === k; })[0];
        return { key: r.key, az: r.az, ru: r.ru, en: r.en,
                 group_name: r.group_name, sort_order: r.sort_order };
      });
      guard(db.from('site_content').upsert(payload, { onConflict: 'key' }))
        .then(function () {
          dirty = {};
          busy(e.currentTarget, false);
          $('#dirtyCount').textContent = '';
          toast(t('saved'), 'good');
        })
        .catch(function (err) { busy(e.currentTarget, false); fail(err); });
    });
  }

  return load();
};

var KEY_LABELS = {
  hero_title:    { az:'Başlıq',            ru:'Заголовок',      en:'Headline' },
  hero_sub:      { az:'Alt mətn',          ru:'Подзаголовок',   en:'Subheading' },
  hero_badge:    { az:'Nişan',             ru:'Плашка',         en:'Badge' },
  services_title:{ az:'Bölmə başlığı',     ru:'Заголовок',      en:'Section title' },
  services_sub:  { az:'Bölmə alt mətni',   ru:'Подзаголовок',   en:'Section subtitle' },
  gallery_title: { az:'Bölmə başlığı',     ru:'Заголовок',      en:'Section title' },
  gallery_sub:   { az:'Bölmə alt mətni',   ru:'Подзаголовок',   en:'Section subtitle' },
  reels_title:   { az:'Videolar başlığı',  ru:'Заголовок видео',en:'Videos title' },
  about_title:   { az:'Başlıq',            ru:'Заголовок',      en:'Title' },
  about_p:       { az:'Mətn',              ru:'Текст',          en:'Text' },
  contact_title: { az:'Başlıq',            ru:'Заголовок',      en:'Title' },
  addr_v:        { az:'Ünvan',             ru:'Адрес',          en:'Address' },
  hours_v:       { az:'İş saatları',       ru:'Часы работы',    en:'Opening hours' },
  footer_tag:    { az:'Alt yazı',          ru:'Подпись',        en:'Footer line' }
};

function prettyKey(key) {
  if (KEY_LABELS[key]) return KEY_LABELS[key][lang] || KEY_LABELS[key].az;
  var svc = key.match(/^svc(\d+)_(t|d)$/);
  if (svc) {
    var what = svc[2] === 't'
      ? { az:'başlıq', ru:'заголовок', en:'title' }
      : { az:'təsvir', ru:'описание',  en:'description' };
    var word = { az:'Xidmət', ru:'Услуга', en:'Service' };
    return (word[lang] || word.az) + ' ' + svc[1] + ' — ' + (what[lang] || what.az);
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* =====================================================================
   14. SETTINGS
   ===================================================================== */
VIEWS.settings = function (view) {
  var c = config();
  var email = (session && session.user && session.user.email) || '';

  view.innerHTML =
    '<div class="grid-2" style="align-items:start">' +
      '<div class="card"><div class="head"><h2>' + esc(t('set_acc')) + '</h2></div>' +
        '<div class="body stack">' +
          '<div>' + infoBit(t('email'), email) + '</div>' +
          '<div class="field"><label>' + esc(t('set_newpw')) + '</label>' +
            '<input class="input" type="password" id="newPw" autocomplete="new-password"></div>' +
          '<div class="row wrap"><button class="btn" id="savePw">' + esc(t('set_pw')) + '</button>' +
            '<span class="spacer"></span>' +
            '<button class="btn ghost" id="soBtn">' + ico('logout') + esc(t('sign_out')) + '</button></div>' +
        '</div></div>' +

      '<div class="card"><div class="head"><h2>' + esc(t('set_backup')) + '</h2></div>' +
        '<div class="body stack">' +
          '<p class="muted small">' + esc(t('set_backupd')) + '</p>' +
          '<div class="row wrap"><button class="btn primary" id="backupBtn">' +
            ico('download') + esc(t('set_download')) + '</button></div>' +
        '</div></div>' +
    '</div>' +

    '<div style="height:16px"></div>' +

    '<div class="card"><div class="head"><h2>' + esc(t('set_conn')) + '</h2></div>' +
      '<div class="body stack">' +
        '<div>' + infoBit(t('set_url'), c.url || '—') + '</div>' +
        '<div>' + infoBit(t('set_key'), c.key ? c.key.slice(0, 18) + '…' : '—') + '</div>' +
        (localConnection()
          ? '<div class="notice warn">' + ico('alert') + '<div>' +
              'Bu bağlantı yalnız bu brauzerdə saxlanılıb. Saytın qalereyası da işləsin deyə ' +
              'bu iki sətri <code>assets/mo-config.js</code> faylına yazın:' +
              '<pre class="snippet">' +
              esc("SUPABASE_URL: '" + c.url + "',\nSUPABASE_ANON_KEY: '" + c.key + "'") +
              '</pre></div></div>'
          : '') +
        '<div class="row wrap">' +
          '<a class="btn" href="guide.html" target="_blank" rel="noopener">' + ico('ext') +
            esc(t('set_docs')) + '</a>' +
          '<a class="btn" href="guide.html#instagram" target="_blank" rel="noopener">' + ico('ig') +
            'Instagram</a>' +
          '<button class="btn" id="replayTour">' + ico('info') + esc(t('set_tour')) + '</button>' +
          '<span class="spacer"></span>' +
          '<button class="btn ghost" id="resetConn">' + esc(t('set_disconnect')) + '</button>' +
        '</div>' +
      '</div></div>';

  $('#savePw').addEventListener('click', function (e) {
    var pw = $('#newPw').value;
    if (!pw || pw.length < 6) { toast(t('set_pwshort'), 'err'); return; }
    busy(e.currentTarget, true);
    db.auth.updateUser({ password: pw }).then(function (res) {
      busy(e.currentTarget, false);
      if (res.error) return fail(res.error);
      $('#newPw').value = '';
      toast(t('saved'), 'good');
    });
  });

  $('#soBtn').addEventListener('click', function () {
    db.auth.signOut().then(function () { session = null; renderLogin(); });
  });

  $('#replayTour').addEventListener('click', function () {
    obGet().then(function (state) { showWelcome(state); });
  });

  $('#resetConn').addEventListener('click', function () {
    try { localStorage.removeItem('mo_supabase'); } catch (e) {}
    location.reload();
  });

  $('#backupBtn').addEventListener('click', function (e) {
    busy(e.currentTarget, true);
    var tables = ['customers', 'prescriptions', 'products', 'stock_moves',
                  'orders', 'order_items', 'site_content', 'instagram_posts'];
    Promise.all(tables.map(function (name) {
      return guard(db.from(name).select('*').limit(10000))
        .then(function (rows) { return [name, rows]; })
        .catch(function () { return [name, []]; });
    })).then(function (pairs) {
      var out = { exported_at: new Date().toISOString() };
      pairs.forEach(function (p) { out[p[0]] = p[1]; });
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'master-optik-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      busy(e.currentTarget, false);
      toast(t('saved'), 'good');
    }).catch(function (err) { busy(e.currentTarget, false); fail(err); });
  });

  return Promise.resolve();
};

function localConnection() {
  try { return !!localStorage.getItem('mo_supabase'); } catch (e) { return false; }
}

/* ===================================================================== */
document.documentElement.lang = lang;
start();

})();
