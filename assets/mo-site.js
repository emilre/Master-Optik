/* Master Optik — public website runtime.
   -------------------------------------------------------------------
   One job: apply text edited in the admin panel (Sayt məzmunu) over the
   page's own [data-i18n] strings, in the active language.

   The galleries are NOT here. The showcase and the Instagram feed are two
   separate sections rendered by the page itself, from showcase_items and
   instagram_posts, inside the design runtime — so they survive route
   changes, which DOM injected from here does not.

   If Supabase is not configured yet, or the network is down, the page is
   left exactly as the designer built it.

   Include after assets/mo-config.js:
     <script src="../assets/mo-config.js"></script>
     <script src="../assets/mo-site.js" defer></script>
*/
(function () {
  'use strict';

  var CFG = window.MO_CONFIG || {};
  var URL_BASE = (CFG.SUPABASE_URL || '').replace(/\/+$/, '');
  var KEY = CFG.SUPABASE_ANON_KEY || '';
  if (!URL_BASE || !KEY) return;              // not set up yet — do nothing

  /* ---------------- tiny REST helper (no library needed) ------------- */
  function rest(path) {
    return fetch(URL_BASE + '/rest/v1/' + path, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ================= 2. SITE COPY OVERRIDES ========================== */

  var OVERRIDES = null;

  function currentLang() {
    try { return localStorage.getItem('mo_lang') || 'az'; } catch (e) { return 'az'; }
  }

  function applyCopy() {
    if (!OVERRIDES) return;
    var lang = currentLang();
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var row = OVERRIDES[nodes[i].getAttribute('data-i18n')];
      if (!row) continue;
      var text = row[lang] || row.az;
      if (!text) continue;
      if (nodes[i].textContent !== text) nodes[i].textContent = text;
      /* overlay.js translates loose text nodes from its own dictionary and
         would put its version back over the shop's. The mark tells it to
         leave this element alone — see translateTree there. It is only set
         once a value from the database has actually been applied, so if the
         database is unreachable the overlay keeps translating as before. */
      nodes[i].setAttribute('data-mo-applied', '');
    }
  }

  /* Some designs run their own i18n pass on window load or a tick after it,
     which would paint over ours. Re-apply a few times, then stop. */
  function applyCopySoon() {
    [0, 250, 800, 2000].forEach(function (ms) { setTimeout(applyCopy, ms); });
    window.addEventListener('load', function () { setTimeout(applyCopy, 60); });
  }

  function watchLanguage() {
    /* the designs re-render [data-i18n] on every language click */
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      if (e.target.closest('[data-lang],[data-mo-lang],[data-mo-pill-lang],.langs button')) {
        setTimeout(applyCopy, 0);
        setTimeout(applyCopy, 150);
      }
    }, true);
  }

  /* ================= boot ============================================ */

  function start() {
    rest('site_content?select=key,az,ru,en')
      .then(function (rows) {
        OVERRIDES = {};
        rows.forEach(function (r) { OVERRIDES[r.key] = r; });
        applyCopySoon();
        watchLanguage();
      })
      .catch(function () { /* keep the page's own copy */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* overlay.js calls this once the page has finished rendering */
  window.MOSite = {
    refresh: applyCopy
  };
})();
