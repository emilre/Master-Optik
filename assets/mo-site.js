/* Master Optik — public website runtime.
   -------------------------------------------------------------------
   Two jobs, both optional and both fail-safe:

   1. Gallery  — replaces the design's static gallery photos with the
      real Instagram posts synced from the admin panel. Each tile links
      to the post on Instagram.
   2. Copy     — applies text edited in the admin panel (Sayt məzmunu)
      over the page's own [data-i18n] strings, in the active language.

   If Supabase is not configured yet, or the network is down, or there
   are no posts, the page is left exactly as the designer built it.

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

  var IG_PROFILE = 'https://instagram.com/master__optik';
  var MAX_POSTS = 12;

  /* ---------------- tiny REST helper (no library needed) ------------- */
  function rest(path) {
    return fetch(URL_BASE + '/rest/v1/' + path, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ================= 1. INSTAGRAM GALLERY ============================ */

  /* Everything below comes out of the database and lands in href/src, so the
     scheme is checked here rather than trusted: a javascript: URL in a post
     row would otherwise execute for every visitor to the site. */
  function safeUrl(value) {
    if (!value) return '';
    var v = String(value).trim();
    return /^https?:\/\//i.test(v) ? v : '';
  }

  function postImage(p) {
    return safeUrl(p.stored_url) || safeUrl(p.thumbnail_url) || safeUrl(p.media_url);
  }

  function shortCaption(p) {
    var c = (p.caption || '').replace(/\s+/g, ' ').trim();
    if (!c) return 'Master Optik — Instagram';
    return c.length > 110 ? c.slice(0, 110) + '…' : c;
  }

  /* Find the grid the design uses for its gallery, so we can reuse the
     design's own tile markup and CSS instead of imposing our own. */
  function findGrid() {
    var explicit = document.querySelector('[data-ig-grid]');
    if (explicit) return explicit;

    var section = document.querySelector(
      '#gallery, #qalereya, #galereya, section.gallery, .gallery'
    );

    /* the bundled designs (d6-d11) name their sections differently — find
       the section whose heading says "gallery" in any of the three languages */
    if (!section) {
      var heads = document.querySelectorAll('h1,h2,h3,.eyebrow,.kicker');
      for (var h = 0; h < heads.length; h++) {
        if (/qalereya|галерея|gallery/i.test(heads[h].textContent || '')) {
          section = heads[h].closest('section') || heads[h].parentNode.parentNode;
          break;
        }
      }
    }
    if (!section) return null;

    var best = null, bestCount = 0;
    var candidates = section.querySelectorAll('*');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var kids = el.children;
      if (kids.length < 3) continue;
      var withImg = 0;
      for (var k = 0; k < kids.length; k++) {
        if (kids[k].tagName === 'IMG' || kids[k].querySelector('img')) withImg++;
      }
      /* a real grid: almost every child is (or holds) a photo */
      if (withImg >= 3 && withImg >= kids.length - 1 && withImg > bestCount) {
        best = el; bestCount = withImg;
      }
    }
    return best;
  }

  var onTileFailed = null;

  var IG_GLYPH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="5"/>' +
    '<circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none"/></svg>';

  function decorate(node, post) {
    var badge = document.createElement('span');
    badge.className = 'mo-ig-badge';
    badge.innerHTML = IG_GLYPH;
    node.appendChild(badge);

    node.classList.add('mo-ig-tile');
    node.setAttribute('title', shortCaption(post));

    if (post.media_type === 'VIDEO') {
      var play = document.createElement('span');
      play.className = 'mo-ig-play';
      play.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
      node.appendChild(play);
    }
  }

  /* The template is one of the design's real tiles, so it can carry the
     original's own furniture — d3 numbers each cell "01", d5 puts the photo
     number in aria-label. Anything that is not the image would otherwise be
     stamped onto all twelve Instagram tiles. */
  function stripTemplateFurniture(node) {
    var kids = node.querySelectorAll('*');
    for (var i = kids.length - 1; i >= 0; i--) {
      var el = kids[i];
      if (el.tagName === 'IMG' || el.querySelector('img')) continue;
      if ((el.textContent || '').trim()) el.remove();
    }
    node.removeAttribute('aria-label');
    node.removeAttribute('title');
  }

  function buildTile(template, post) {
    var node = template.cloneNode(true);
    stripTemplateFurniture(node);
    var src = postImage(post);
    var permalink = safeUrl(post.permalink) || IG_PROFILE;
    if (!src) return null;

    var img = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      node.insertBefore(img, node.firstChild);
    }
    img.removeAttribute('srcset');
    img.removeAttribute('data-ph');      /* designs' own placeholder hook */
    img.setAttribute('loading', 'lazy');
    img.alt = shortCaption(post);
    img.src = src;
    img.addEventListener('error', function () {
      node.remove();
      if (onTileFailed) onTileFailed();
    });

    /* make the whole tile open the post on Instagram */
    var link = node.tagName === 'A' ? node : node.querySelector('a');
    if (link) {
      link.href = permalink;
      link.target = '_blank';
      link.rel = 'noopener';
    } else {
      node.setAttribute('role', 'link');
      node.setAttribute('tabindex', '0');
      node.style.cursor = 'pointer';
      var open = function () { window.open(permalink, '_blank', 'noopener'); };
      node.addEventListener('click', open);
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }

    decorate(node, post);
    return node;
  }

  function injectStyles() {
    if (document.getElementById('mo-ig-css')) return;
    var css = document.createElement('style');
    css.id = 'mo-ig-css';
    css.textContent =
      '.mo-ig-badge{position:absolute;top:10px;right:10px;width:26px;height:26px;' +
      'display:flex;align-items:center;justify-content:center;border-radius:8px;' +
      'background:rgba(12,12,14,.55);color:#fff;backdrop-filter:blur(4px);' +
      'opacity:0;transition:opacity .25s ease;pointer-events:none;z-index:2}' +
      '.mo-ig-badge svg{width:15px;height:15px}' +
      '.mo-ig-tile:hover .mo-ig-badge,.mo-ig-tile:focus-visible .mo-ig-badge{opacity:1}' +
      '.mo-ig-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:46px;height:46px;border-radius:50%;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(12,12,14,.45);color:#fff;' +
      'backdrop-filter:blur(4px);pointer-events:none;z-index:2}' +
      '.mo-ig-play svg{width:20px;height:20px;margin-left:2px}' +
      '.mo-ig-follow{display:block;text-align:center;margin:22px auto 0;font-size:14px;' +
      'font-weight:700;opacity:.72;letter-spacing:.01em}' +
      '.mo-ig-follow:hover{opacity:1;text-decoration:underline}';
    document.head.appendChild(css);
  }

  function renderGallery(posts) {
    if (!posts.length) return;
    var grid = findGrid();
    if (!grid || !grid.children.length) return;
    if (grid.getAttribute('data-ig-rendered')) return;   /* already swapped */

    injectStyles();
    var template = grid.children[0].cloneNode(true);
    /* Instagram's own media links expire after a day or two. If they have
       and every tile 404s, fall back to the photos the designer shipped
       rather than showing an empty gallery. */
    var original = Array.prototype.slice.call(grid.children);
    var limit = parseInt(grid.getAttribute('data-ig-count'), 10) || MAX_POSTS;

    var frag = document.createDocumentFragment();
    var used = 0;
    for (var i = 0; i < posts.length && used < limit; i++) {
      var tile = buildTile(template, posts[i]);
      if (tile) { frag.appendChild(tile); used++; }
    }
    if (!used) return;

    onTileFailed = function () {
      if (grid.children.length) return;
      /* every Instagram image failed — put the design's own photos back */
      onTileFailed = null;
      grid.removeAttribute('data-ig-rendered');
      original.forEach(function (el) { grid.appendChild(el); });
      var follow = grid.parentNode && grid.parentNode.querySelector('.mo-ig-follow');
      if (follow) follow.remove();
    };

    grid.innerHTML = '';
    grid.appendChild(frag);
    grid.setAttribute('data-ig-rendered', String(used));

    /* the badge is positioned against the tile, and getComputedStyle only
       answers for a node that is in the document — so this runs after append */
    Array.prototype.forEach.call(grid.children, function (tile) {
      if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';
    });

    /* follow link under the grid */
    if (!grid.parentNode.querySelector('.mo-ig-follow')) {
      var a = document.createElement('a');
      a.className = 'mo-ig-follow';
      a.href = IG_PROFILE;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '@master__optik';
      grid.parentNode.insertBefore(a, grid.nextSibling);
    }
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
      if (text && nodes[i].textContent !== text) nodes[i].textContent = text;
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
      if (e.target.closest('[data-lang],[data-mo-pill-lang],.langs button')) {
        setTimeout(applyCopy, 0);
        setTimeout(applyCopy, 150);
      }
    }, true);
  }

  /* ================= boot ============================================ */

  function start() {
    rest('instagram_posts?select=id,permalink,media_type,media_url,thumbnail_url,' +
         'stored_url,caption,posted_at&hidden=eq.false' +
         '&order=sort_order.asc,posted_at.desc&limit=' + MAX_POSTS)
      .then(renderGallery)
      .catch(function () { /* keep the designer's photos */ });

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

  /* bundled designs (d6–d11) unpack themselves after load — overlay.js
     calls this again once their DOM exists */
  window.MOSite = {
    refresh: function () {
      rest('instagram_posts?select=id,permalink,media_type,media_url,thumbnail_url,' +
           'stored_url,caption,posted_at&hidden=eq.false' +
           '&order=sort_order.asc,posted_at.desc&limit=' + MAX_POSTS)
        .then(renderGallery).catch(function () {});
    }
  };
})();
