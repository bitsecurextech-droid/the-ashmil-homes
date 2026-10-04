const { createClient } = require('@supabase/supabase-js');

/* ============================================================
   ENVIRONMENT
   ============================================================ */

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY  = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/* ============================================================
   VALIDATION
   Fail loudly at boot if required env vars are missing —
   it's much better to crash on startup than to serve broken
   responses for hours because of a typo in .env.
   ============================================================ */

if (!SUPABASE_URL) {
  throw new Error('❌ SUPABASE_URL is not set in .env');
}

// Public client requires the anon key.
if (!SUPABASE_ANON_KEY) {
  throw new Error('❌ SUPABASE_ANON_KEY is not set in .env');
}

// Warn (not throw) if the service key is missing — some deployments
// may only need public reads and can run without it.
if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_KEY is not set — admin writes and Storage uploads will fail.');
}

/* ============================================================
   PUBLIC CLIENT (anon key)
   Use for: GET /api/properties, GET /api/properties/:id
   Respects Row Level Security.
   ============================================================ */

const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/* ============================================================
   ADMIN CLIENT (service_role key)
   Use for: everything under /api/admin/*, Storage uploads,
   any write operation that must bypass RLS.
   NEVER expose this client or its key to the browser.
   ============================================================ */

const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

/* ============================================================
   EXPORTS
   Both shapes work so existing requires keep functioning:
     const supabase = require('../config/supabase');        // → public
     const { supabaseAdmin } = require('../config/supabase');// → admin
   ============================================================ */

module.exports = supabasePublic;
module.exports.supabasePublic = supabasePublic;
module.exports.supabaseAdmin  = supabaseAdmin;
