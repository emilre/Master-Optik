/* Master Optik — shared enhancement overlay for the bundled designs (d6–d11).
   Adds: WhatsApp/Call floating buttons, a collapsing mobile menu built from the
   page's own nav, and an AZ/RU/EN switcher with dictionary-based translation.
   Self-contained; namespaced with mo- prefixes. */
(function () {
  'use strict';
  var SCRIPT = document.currentScript;
  var ACCENT = (SCRIPT && SCRIPT.getAttribute('data-accent')) || '#f27c17';
  var PHONE = '+994777451905';
  var WA = 'https://wa.me/994777451905';

  /* ---------------- i18n ---------------- */
  var UI = {
    az: { menu: 'Menyu', call: 'Zəng et', wa: 'WhatsApp', close: 'Bağla' },
    ru: { menu: 'Меню', call: 'Позвонить', wa: 'WhatsApp', close: 'Закрыть' },
    en: { menu: 'Menu', call: 'Call', wa: 'WhatsApp', close: 'Close' }
  };
  /* az → [ru, en]; keys must match rendered text nodes after whitespace collapse */
  var DICT = {
    'Ana səhifə': ['Главная', 'Home'],
    'Xidmətlər': ['Услуги', 'Services'],
    'Qalereya': ['Галерея', 'Gallery'],
    'Vitrin': ['Витрина', 'Showcase'],
    'Əlaqə': ['Контакты', 'Contact'],
    'Zəng et': ['Позвонить', 'Call'],
    'Zəng edin': ['Позвоните', 'Call us'],
    'WhatsApp yazın': ['Напишите в WhatsApp', 'Message on WhatsApp'],
    'Zəng və WhatsApp': ['Звонок и WhatsApp', 'Call & WhatsApp'],
    'İş saatları': ['Часы работы', 'Opening hours'],
    'Bazar ertəsi — Cümə': ['Понедельник — пятница', 'Monday — Friday'],
    'Şənbə': ['Суббота', 'Saturday'],
    'Bazar': ['Воскресенье', 'Sunday'],
    'Ünvan və saatlar': ['Адрес и часы', 'Address & hours'],
    'Xəritədə bax': ['Показать на карте', 'View on map'],
    'Bizə gəlin': ['Приходите к нам', 'Visit us'],
    'Faiq Yusifov küç. 73': ['ул. Фаига Юсифова 73', '73 Faig Yusifov str.'],
    'FAİQ YUSİFOV KÜÇ. 73': ['УЛ. ФАИГА ЮСИФОВА 73', '73 FAIG YUSIFOV STR.'],
    'Faiq Yusifov 73': ['Фаиг Юсифов 73', 'Faig Yusifov 73'],
    'Faiq Yusifov küç. 73 · Bakı': ['ул. Фаига Юсифова 73 · Баку', '73 Faig Yusifov str. · Baku'],
    'Faiq Yusifov küç. 73, N.Nərimanov, Bakı.': ['ул. Фаига Юсифова 73, Нариманов, Баку.', '73 Faig Yusifov str., Narimanov, Baku.'],
    'N.Nərimanov, Bakı': ['Нариманов, Баку', 'Narimanov, Baku'],
    'N.Nərimanov rayonu, metrodan yaxın.': ['Наримановский район, рядом с метро.', 'Narimanov district, near the metro.'],
    'Master Optik · Bakı': ['Master Optik · Баку', 'Master Optik · Baku'],
    'Master Optik · Faiq Yusifov küç. 73, Bakı': ['Master Optik · ул. Фаига Юсифова 73, Баку', 'Master Optik · 73 Faig Yusifov str., Baku'],
    'Günəş eynəkləri': ['Солнцезащитные очки', 'Sunglasses'],
    'Optik çərçivələr': ['Оптические оправы', 'Optical frames'],
    'Linzalar': ['Линзы', 'Lenses'],
    'Təmir': ['Ремонт', 'Repairs'],
    'Təmir və linza': ['Ремонт и линзы', 'Repairs & lenses'],
    'Fərdi sifariş': ['Индивидуальный заказ', 'Custom orders'],
    'Mağazada seçim': ['Выбор в магазине', 'In-store selection'],
    'Eynək satışı': ['Продажа очков', 'Eyewear sales'],
    'Uşaq eynəkləri': ['Детские очки', "Kids' eyewear"],
    'Uşaq': ['Детские', 'Kids'],
    'Nə edirik?': ['Что мы делаем?', 'What we do'],
    'Altı iş — hamısı bir ünvanda.': ['Шесть услуг — всё по одному адресу.', 'Six services — all at one address.'],
    'Satış, linza, təmir, fərdi sifariş — altı iş bir ünvanda.': ['Продажа, линзы, ремонт, индивидуальный заказ — шесть услуг по одному адресу.', 'Sales, lenses, repairs, custom orders — six services at one address.'],
    'UV qorumalı modellər, brend və büdcə variantları. Yerində sınayıb seçin.': ['Модели с UV-защитой, брендовые и бюджетные варианты. Примерьте и выберите на месте.', 'UV-protected models, brand and budget options. Try and choose in store.'],
    'Metal, asetat və titan çərçivələr. Üz formanıza uyğun ölçü seçirik.': ['Оправы из металла, ацетата и титана. Подберём размер под форму вашего лица.', 'Metal, acetate and titanium frames. We match the size to your face shape.'],
    'Antirefleks, blue-cut, fotoxrom və proqressiv linzalar reseptə uyğun hazırlanır.': ['Антибликовые, blue-cut, фотохромные и прогрессивные линзы изготавливаются по рецепту.', 'Anti-reflective, blue-cut, photochromic and progressive lenses made to prescription.'],
    'Qırılmış çərçivə, vint, menteşə və burun yastıqcalarının bərpası — çox hallarda eyni gün.': ['Ремонт сломанных оправ, винтов, петель и носоупоров — чаще всего в тот же день.', 'Repair of broken frames, screws, hinges and nose pads — usually same day.'],
    'Axtardığınız model mağazada yoxdursa, sizin üçün sifariş edirik.': ['Если нужной модели нет в магазине, закажем её для вас.', "If the model you want isn't in store, we'll order it for you."],
    'Gəlin, taxıb baxın. Ustamız ölçü və oturuşu yerində tənzimləyir.': ['Приходите и примерьте. Мастер на месте подгонит размер и посадку.', 'Come try them on. Our master adjusts size and fit on the spot.'],
    'Təmir və sifariş üçün əvvəlcədən zəng etmək tövsiyə olunur.': ['Для ремонта и заказа рекомендуем позвонить заранее.', 'For repairs and orders, calling ahead is recommended.'],
    'Çox hallarda eyni gün': ['Чаще всего в тот же день', 'Usually same day'],
    'Mağazada yoxdursa — gətiririk': ['Если нет в магазине — привезём', "Not in store? We'll get it"],
    'Ustamız yerində tənzimləyir': ['Мастер настроит на месте', 'Adjusted on the spot'],
    'Ölçü tənzimi': ['Подгонка размера', 'Fit adjustment'],
    'Linza emalı': ['Обработка линз', 'Lens cutting'],
    'Linza': ['Линза', 'Lens'],
    'UV qorumalı': ['UV-защита', 'UV protected'],
    'Rəflərimizdəki brendlər': ['Бренды на наших полках', 'Brands on our shelves'],
    'Brend divarı': ['Стена брендов', 'Brand wall'],
    'Siyahı mağazadakı rəflərdən götürülüb — dəyişməli brend varsa deyin.': ['Список взят с полок магазина — скажите, если какой-то бренд нужно заменить.', 'The list comes from our store shelves — tell us if a brand should change.'],
    'Vitrinimiz': ['Наша витрина', 'Our showcase'],
    'Mağazadan və işlərimizdən şəkillər.': ['Фотографии магазина и наших работ.', 'Photos of the store and our work.'],
    'Mağazadan, çərçivələrdən və işlərimizdən.': ['Магазин, оправы и наши работы.', 'The store, frames and our work.'],
    'Qalereyaya keç →': ['Перейти в галерею →', 'Open the gallery →'],
    'Eynək seçmək': ['Выбрать очки', 'Choosing glasses'],
    'asan olsun.': ['— это просто.', 'made easy.'],
    'Satış, təmir və fərdi sifariş. Gəlin, rahat-rahat seçin — hansı çərçivənin sizə yaraşdığını yerində göstərək.': ['Продажа, ремонт и индивидуальный заказ. Приходите и выбирайте спокойно — на месте покажем, какая оправа вам идёт.', 'Sales, repairs and custom orders. Come choose at ease — we will show you which frame suits you.'],
    'Satış, təmir və fərdi sifariş. Faiq Yusifov küç. 73, N.Nərimanov. Gəlin, taxıb baxın.': ['Продажа, ремонт и индивидуальный заказ. ул. Фаига Юсифова 73, Нариманов. Приходите и примерьте.', 'Sales, repairs and custom orders. 73 Faig Yusifov str., Narimanov. Come try them on.'],
    'Eynək satışı, təmiri və fərdi sifarişi. Rəngi, formanı və oturuşu mağazada, öz gözünüzlə seçin.': ['Продажа, ремонт и индивидуальный заказ очков. Цвет, форму и посадку выбирайте в магазине, своими глазами.', 'Eyewear sales, repairs and custom orders. Pick color, shape and fit in store, with your own eyes.'],
    'HƏR NÖV EYNƏYİN TƏK ÜNVANI · BAKI': ['ЕДИНЫЙ АДРЕС ДЛЯ ЛЮБЫХ ОЧКОВ · БАКУ', 'ONE ADDRESS FOR EVERY KIND OF EYEWEAR · BAKU'],
    'SATIŞ · TƏMİR · SİFARİŞ': ['ПРОДАЖА · РЕМОНТ · ЗАКАЗ', 'SALES · REPAIRS · ORDERS'],
    'AYDIN GÖRÜŞ': ['ЧЁТКОЕ ЗРЕНИЕ', 'CLEAR VISION'],
    'EYNƏK': ['ОЧКИ', 'EYEWEAR'],
    'Eynək.': ['Очки.', 'Eyewear.'],
    'Bu gün.': ['Сегодня.', 'Today.'],
    'DİOPTRİ': ['ДИОПТРИИ', 'DIOPTER'],
    'Gecə də aydın · Bakı': ['Ясно и ночью · Баку', 'Clear even at night · Baku'],
    'Linzanı': ['Линзу', 'Try the'],
    'sınayın.': ['попробуйте.', 'lens.'],
    'AÇIQ': ['СВЕТЛАЯ', 'LIGHT'],
    'TÜND': ['ТЁМНАЯ', 'DARK'],
    'Sürgünü çəkin — günəş linzasının tündlüyü bütün səhifəyə tətbiq olunur. Mağazada eynisini gözünüzlə görəcəksiniz.': ['Потяните ползунок — затемнение солнцезащитной линзы применится ко всей странице. В магазине увидите то же самое своими глазами.', 'Drag the slider — the sun-lens tint applies to the whole page. In store you will see the same with your own eyes.'],
    'Sürgüyü çəkin — linza fərqini görün': ['Потяните ползунок — увидьте разницу линз', 'Drag the slider — see the lens difference'],
    'Sürgünü sağa-sola çəkin': ['Двигайте ползунок влево-вправо', 'Drag the slider left and right'],
    'Günəş · tünd linza': ['Солнце · тёмная линза', 'Sun · dark lens'],
    'Günəş rəfi': ['Полка солнцезащитных', 'Sunglasses shelf'],
    'Hamısı': ['Все', 'All'],
    'Optik': ['Оптика', 'Optical'],
    'Metal · asetat · titan': ['Металл · ацетат · титан', 'Metal · acetate · titanium'],
    'İncə metal': ['Тонкий металл', 'Thin metal'],
    'Kvadrat asetat': ['Квадратный ацетат', 'Square acetate'],
    'Uşaq · yumşaq çərçivə': ['Детские · мягкая оправа', 'Kids · soft frame'],
    'Yumşaq, davamlı çərçivələr': ['Мягкие, прочные оправы', 'Soft, durable frames'],
    'Hansı forma': ['Какая форма', 'Which shape'],
    'sizə yaraşır?': ['вам идёт?', 'suits you?'],
    'Üz formanıza görə seçin': ['Выбирайте по форме лица', 'Choose by face shape'],
    'Aşağıdan üz formanızı seçin — vitrin yalnız o formaya uyğun çərçivələri göstərsin. Qərar verə bilmirsinizsə, mağazada üzünüzə baxıb deyəcəyik.': ['Выберите форму лица ниже — витрина покажет только подходящие оправы. Если не можете решить, в магазине посмотрим на вас и подскажем.', "Pick your face shape below — the showcase will show only matching frames. Can't decide? In store we'll look and tell you."],
    'Oval üz': ['Овальное лицо', 'Oval face'],
    'Yumru üz': ['Круглое лицо', 'Round face'],
    'Kvadrat üz': ['Квадратное лицо', 'Square face'],
    'Eynəksiz': ['Без очков', 'Without glasses'],
    'Eynəklə': ['В очках', 'With glasses'],
    'Eynəksiz və': ['Без очков и', 'Without and'],
    'eynəklə —': ['в очках —', 'with glasses —'],
    'fərqi görün.': ['увидьте разницу.', 'see the difference.'],
    'Sağdakı şəklin üstündəki dəstəyi hərəkət etdirin. Sol tərəf eynəksiz görüntü, sağ tərəf düzgün linza ilə.': ['Двигайте ручку на фото справа. Слева — изображение без очков, справа — с правильной линзой.', 'Move the handle on the photo. Left side — vision without glasses, right side — with the correct lens.'],
    'Üzərinə gəlin — taxılmış halını görün': ['Наведите — увидите, как сидит', 'Hover — see it worn'],
    '9 çərçivə': ['9 оправ', '9 frames'],
    'İndi açıqdır': ['Сейчас открыто', 'Open now'],
    'Rəngi': ['Цвет', 'Color'],
    'gözünüzlə': ['своими глазами', 'with your eyes'],
    'seçin.': ['выбирайте.', 'choose.'],
    'mağaza vitrini': ['витрина магазина', 'storefront'],
    'optik çərçivə portret': ['портрет в оправе', 'frame portrait'],
    'günəş eynəyi': ['солнцезащитные очки', 'sunglasses'],
    'təmir prosesi': ['процесс ремонта', 'repair process'],
    'linza kəsimi': ['резка линз', 'lens cutting'],
    'uşaq eynəyi': ['детские очки', 'kids glasses'],
    'çərçivə rəfi': ['полка оправ', 'frame shelf'],
    'usta işi': ['работа мастера', "master's work"],
    'mağaza interyeri': ['интерьер магазина', 'store interior']
  };

  var lang = 'az';
  try { var s = localStorage.getItem('mo_lang'); if (s === 'ru' || s === 'en' || s === 'az') lang = s; } catch (e) {}

  /* original-text registry so switching is lossless */
  var orig = new WeakMap();
  var translating = false;
  function norm(t) { return t.replace(/\s+/g, ' ').trim(); }
  function applyLangToNode(node) {
    var raw = orig.has(node) ? orig.get(node) : node.nodeValue;
    var key = norm(raw);
    if (!key) return;
    if (!orig.has(node)) {
      if (!DICT[key]) return;
      orig.set(node, node.nodeValue);
    }
    var az = orig.get(node);
    var k = norm(az);
    var entry = DICT[k];
    if (!entry) return;
    var target = lang === 'az' ? az : az.replace(k, lang === 'ru' ? entry[0] : entry[1]);
    if (node.nodeValue !== target) node.nodeValue = target;
  }
  function translateTree(root) {
    translating = true;
    try {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest('[data-mo-ui]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var n; while ((n = w.nextNode())) applyLangToNode(n);
    } finally { translating = false; }
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('mo_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    translateTree(document.body);
    refreshUiLabels();
    if (navSources.length) buildMenuNav();
  }

  /* ---------------- styles ---------------- */
  var css = document.createElement('style');
  css.setAttribute('data-mo-ui', '');
  css.textContent =
    '.mo-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;gap:12px;padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom)}' +
    '.mo-fab a{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 10px 24px -6px rgba(0,0,0,.4);transition:transform .18s ease;-webkit-tap-highlight-color:transparent;text-decoration:none}' +
    '.mo-fab a:hover{transform:translateY(-2px) scale(1.05)}' +
    '.mo-fab svg{width:27px;height:27px}' +
    '.mo-fab .mo-wa{background:#25d366}.mo-fab .mo-call{background:' + ACCENT + '}' +
    '.mo-lang{position:fixed;left:14px;bottom:16px;z-index:2147483000;display:flex;gap:2px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:4px;box-shadow:0 8px 20px -8px rgba(0,0,0,.35);padding-left:max(4px,env(safe-area-inset-left));margin-bottom:env(safe-area-inset-bottom)}' +
    '.mo-lang button{border:0;background:transparent;font:700 12.5px/1 system-ui,sans-serif;color:#555;padding:8px 11px;border-radius:999px;cursor:pointer;min-height:32px}' +
    '.mo-lang button[aria-pressed="true"]{background:' + ACCENT + ';color:#fff}' +
    '.mo-burger{display:none;position:fixed;top:12px;right:12px;z-index:2147483001;width:46px;height:46px;border-radius:12px;border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.94);backdrop-filter:blur(8px);box-shadow:0 6px 18px -8px rgba(0,0,0,.4);cursor:pointer;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}' +
    '.mo-burger span{display:block;width:20px;height:2px;background:#222;position:relative}' +
    '.mo-burger span::before,.mo-burger span::after{content:"";position:absolute;left:0;width:20px;height:2px;background:#222}' +
    '.mo-burger span::before{top:-6px}.mo-burger span::after{top:6px}' +
    '.mo-menu{position:fixed;inset:0;z-index:2147483002;visibility:hidden;pointer-events:none}' +
    '.mo-menu.open{visibility:visible;pointer-events:auto}' +
    '.mo-menu .mo-bg{position:absolute;inset:0;background:rgba(15,20,20,.45);opacity:0;transition:opacity .25s ease}' +
    '.mo-menu.open .mo-bg{opacity:1}' +
    '.mo-menu .mo-panel{position:absolute;top:0;right:0;height:100%;width:min(84vw,340px);background:#fff;box-shadow:-18px 0 50px -25px rgba(0,0,0,.55);transform:translateX(102%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;padding:18px;overflow-y:auto;box-sizing:border-box;padding-bottom:calc(18px + env(safe-area-inset-bottom))}' +
    '.mo-menu.open .mo-panel{transform:translateX(0)}' +
    '.mo-menu .mo-close{align-self:flex-end;width:44px;height:44px;border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:12px;cursor:pointer;font-size:20px;line-height:1;color:#222}' +
    '.mo-menu nav{display:flex;flex-direction:column;margin-top:8px}' +
    '.mo-menu nav a{font:600 17px/1.2 system-ui,sans-serif;color:#1c1c1c;text-decoration:none;padding:14px 4px;border-bottom:1px solid rgba(0,0,0,.08)}' +
    '.mo-menu .mo-mlang{display:flex;gap:8px;margin:16px 0}' +
    '.mo-menu .mo-mlang button{flex:1;border:1px solid rgba(0,0,0,.15);background:#fff;font:700 14px/1 system-ui,sans-serif;color:#555;padding:12px 0;border-radius:12px;cursor:pointer;min-height:44px}' +
    '.mo-menu .mo-mlang button[aria-pressed="true"]{background:' + ACCENT + ';color:#fff;border-color:' + ACCENT + '}' +
    '.mo-menu .mo-acts{display:flex;flex-direction:column;gap:10px;margin-top:auto;padding-top:14px}' +
    '.mo-menu .mo-acts a{display:flex;align-items:center;justify-content:center;gap:8px;font:700 15px/1 system-ui,sans-serif;color:#fff;text-decoration:none;padding:14px 0;border-radius:999px;min-height:48px}' +
    '.mo-menu .mo-acts .mo-a-call{background:' + ACCENT + '}.mo-menu .mo-acts .mo-a-wa{background:#25d366}' +
    '.mo-menu .mo-acts svg{width:20px;height:20px;flex:none}' +
    '@media (max-width:899px){.mo-burger{display:flex}[data-mo-hidenav]{display:none!important}.mo-lang{bottom:84px}.mo-fab{bottom:84px}[data-dc-tpl]{max-width:100%!important}}' +
    '@media (prefers-reduced-motion:reduce){.mo-menu .mo-panel,.mo-menu .mo-bg,.mo-fab a{transition:none}}';
  /* appended in mount() — the bundler rewrites the document while unpacking,
     which would wipe a style added at parse time */

  /* ---------------- UI ---------------- */
  var WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.4 1.3-1.94 1.35-.5.05-.95.24-3.2-.67-2.7-1.06-4.42-3.8-4.56-3.98-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.94-2.25.24-.27.53-.34.71-.34.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.82 2 .89 2.14.07.14.12.31.02.49-.09.18-.14.29-.27.45-.14.16-.29.36-.41.48-.14.14-.28.29-.12.57.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.27.14.43.12.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.61-.13.24.09 1.55.73 1.82.86.27.14.45.2.51.31.07.11.07.64-.17 1.32Z"/></svg>';
  var CALL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>';

  var fab = document.createElement('div');
  fab.className = 'mo-fab'; fab.setAttribute('data-mo-ui', '');
  fab.innerHTML = '<a class="mo-wa" href="' + WA + '" target="_blank" rel="noopener">' + WA_SVG + '</a>' +
                  '<a class="mo-call" href="tel:' + PHONE + '">' + CALL_SVG + '</a>';

  var pill = document.createElement('div');
  pill.className = 'mo-lang'; pill.setAttribute('data-mo-ui', '');
  pill.setAttribute('role', 'group'); pill.setAttribute('aria-label', 'Language');
  pill.innerHTML = '<button data-mo-lang="az">AZ</button><button data-mo-lang="ru">RU</button><button data-mo-lang="en">EN</button>';

  var burger = document.createElement('button');
  burger.className = 'mo-burger'; burger.setAttribute('data-mo-ui', '');
  burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-controls', 'mo-menu');
  burger.innerHTML = '<span></span>';

  var menu = document.createElement('div');
  menu.className = 'mo-menu'; menu.id = 'mo-menu'; menu.setAttribute('data-mo-ui', '');
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-modal', 'true');
  menu.innerHTML = '<div class="mo-bg"></div><div class="mo-panel"><button class="mo-close">✕</button><nav></nav>' +
    '<div class="mo-mlang"><button data-mo-lang="az">AZ</button><button data-mo-lang="ru">RU</button><button data-mo-lang="en">EN</button></div>' +
    '<div class="mo-acts"><a class="mo-a-call" href="tel:' + PHONE + '">' + CALL_SVG + '<span class="mo-l-call">Zəng et</span></a>' +
    '<a class="mo-a-wa" href="' + WA + '" target="_blank" rel="noopener">' + WA_SVG + '<span>WhatsApp</span></a></div></div>';

  function refreshUiLabels() {
    var u = UI[lang];
    burger.setAttribute('aria-label', u.menu);
    menu.querySelector('.mo-close').setAttribute('aria-label', u.close);
    menu.querySelector('.mo-l-call').textContent = u.call;
    fab.querySelector('.mo-wa').setAttribute('aria-label', u.wa);
    fab.querySelector('.mo-call').setAttribute('aria-label', u.call);
    document.querySelectorAll('[data-mo-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mo-lang') === lang));
    });
  }

  var lastFocus = null;
  function openMenu() {
    menu.classList.add('open'); burger.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    lastFocus = document.activeElement;
    menu.querySelector('.mo-close').focus();
  }
  function closeMenu() {
    menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  burger.addEventListener('click', function () { menu.classList.contains('open') ? closeMenu() : openMenu(); });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('.mo-bg') || e.target.closest('.mo-close')) closeMenu();
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-mo-lang]');
    if (b) setLang(b.getAttribute('data-mo-lang'));
  });

  /* ---------------- nav discovery ---------------- */
  var navSources = [];
  function buildMenuNav() {
    var nav = menu.querySelector('nav');
    nav.innerHTML = '';
    navSources.forEach(function (srcA) {
      var a = document.createElement('a');
      a.href = srcA.getAttribute('href') || '#';
      a.textContent = norm(srcA.textContent);
      var key = norm(orig.has(srcA.firstChild) ? orig.get(srcA.firstChild) : srcA.textContent);
      if (DICT[key]) a.textContent = lang === 'az' ? key : DICT[key][lang === 'ru' ? 0 : 1];
      a.addEventListener('click', function (ev) {
        ev.preventDefault(); closeMenu();
        srcA.click ? srcA.click() : (location.hash = a.getAttribute('href'));
      });
      nav.appendChild(a);
    });
  }
  function discoverNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]'))
      .filter(function (a) {
        if (a.closest('[data-mo-ui]')) return false;
        var t = norm(a.textContent);
        if (!t || t.length > 26) return false;
        if (/master\s*optik/i.test(t)) return false;
        var r = a.getBoundingClientRect();
        return r.top >= -10 && r.top < 160 && r.width > 0;
      });
    if (links.length < 2) return false;
    /* common ancestor of the top links = the nav bar to collapse */
    var anc = links[0].parentElement;
    while (anc && anc !== document.body) {
      var inside = links.filter(function (a) { return anc.contains(a); });
      if (inside.length === links.length) break;
      anc = anc.parentElement;
    }
    navSources = links;
    if (anc && anc !== document.body) {
      /* hide only the link row, not a header that may contain the brand */
      var row = links[0].parentElement;
      while (row && row !== anc && !links.every(function (a) { return row.contains(a); })) row = row.parentElement;
      (row || anc).setAttribute('data-mo-hidenav', '');
    }
    buildMenuNav();
    return true;
  }

  /* ---------------- boot ---------------- */
  function mount() {
    (document.head || document.body).appendChild(css);
    document.body.appendChild(fab);
    document.body.appendChild(pill);
    document.body.appendChild(burger);
    document.body.appendChild(menu);
    refreshUiLabels();
    translateTree(document.body);
    var mo = new MutationObserver(function (muts) {
      if (translating) return;
      var dirty = false;
      muts.forEach(function (m) {
        if (m.target.closest && m.target.closest('[data-mo-ui]')) return;
        dirty = true;
      });
      if (dirty) {
        translateTree(document.body);
        if (!navSources.length || !navSources[0].isConnected) discoverNav();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    var ready = document.body && !document.getElementById('__bundler_loading') && document.body.children.length > 0;
    if (ready || tries > 60) {
      clearInterval(t);
      if (!document.body) return;
      mount();
      var navTries = 0;
      var nt = setInterval(function () {
        navTries++;
        if (discoverNav() || navTries > 30) clearInterval(nt);
      }, 400);
    }
  }, 250);
})();
