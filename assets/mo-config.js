/* Master Optik — shared front-end configuration.
   -------------------------------------------------------------------
   Fill these two values in ONCE, after creating the Supabase project
   (see admin/SETUP.md).  They are safe to commit: the anon key is a
   public key and every table is protected by Row Level Security, so a
   visitor can only read the website texts and the visible Instagram
   posts — never customers, orders or stock.

   Supabase Dashboard → Project Settings → API
     Project URL  →  SUPABASE_URL
     anon public  →  SUPABASE_ANON_KEY
*/
window.MO_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};

/* The admin panel can hold a connection locally before it is committed
   here (first-run wizard). That override only ever applies on the
   owner's own device. */
try {
  var mo_local = JSON.parse(localStorage.getItem('mo_supabase') || 'null');
  if (mo_local && mo_local.url && mo_local.key) {
    window.MO_CONFIG.SUPABASE_URL = mo_local.url;
    window.MO_CONFIG.SUPABASE_ANON_KEY = mo_local.key;
  }
} catch (e) {}
