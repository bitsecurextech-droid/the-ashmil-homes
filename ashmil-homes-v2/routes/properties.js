const express = require('express');
const supabase = require('../config/supabase');
const router = express.Router();

/* ============================================================
   Helpers
   ============================================================ */

// PostgREST `.or()` filters use commas and parentheses as syntax.
// Any user input containing those characters (or `%`, `"`, `\`, `.`)
// can break the filter or produce wrong results. Escape them.
function escapeForPostgrest(str = '') {
  return String(str)
    .replace(/[\\%_,()"'*]/g, '')   // strip PostgREST/SQL-wildcard special chars
    .trim()
    .slice(0, 100);                 // hard cap to prevent abuse
}

// PostgREST column whitelist for sorting. Anything else falls back to created_at.
const SORT_MAP = {
  newest:     { column: 'created_at', ascending: false },
  oldest:     { column: 'created_at', ascending: true  },
  'price-asc':  { column: 'price',    ascending: true  },
  'price-desc': { column: 'price',    ascending: false }
};

const PAGE_SIZE = 24; // listings per page

/* ============================================================
   GET /api/properties
   Query params:
     category   houses | land | shortlets | flats
     location   free text (partial match)
     search     free text (matches title or location)
     sort       newest | oldest | price-asc | price-desc
     page       1-based page number (default 1)
     limit      override PAGE_SIZE (max 60)
   Returns: array of properties (or { data, page, pageSize, total } when paged)
   ============================================================ */
router.get('/', async (req, res) => {
  try {
    const { category, location, search, sort, page, limit } = req.query;

    let query = supabase.from('properties').select('*', { count: 'exact' });

    // --- Filters ---
    if (category && typeof category === 'string') {
      // Only allow known categories. Prevents someone enumerating arbitrary strings.
      const allowed = ['houses', 'land', 'shortlets', 'flats'];
      if (allowed.includes(category)) {
        query = query.eq('category', category);
      }
    }

    if (location && typeof location === 'string') {
      const loc = escapeForPostgrest(location);
      if (loc) query = query.ilike('location', `%${loc}%`);
    }

    if (search && typeof search === 'string') {
      const s = escapeForPostgrest(search);
      if (s) {
        // Uses PostgREST `.or()` — commas separate clauses, so `s` must not contain commas.
        // escapeForPostgrest already strips them.
        query = query.or(`title.ilike.%${s}%,location.ilike.%${s}%`);
      }
    }

    // --- Sorting ---
    const sortKey = (sort && SORT_MAP[sort]) ? sort : 'newest';
    const { column, ascending } = SORT_MAP[sortKey];
    query = query.order(column, { ascending, nullsFirst: false });

    // --- Pagination ---
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(limit, 10) || PAGE_SIZE));
    const from = (pageNum - 1) * pageSize;
    const to   = from + pageSize - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/properties] Supabase error:', error.message);
      return res.status(500).json({ error: 'Could not load properties.' });
    }

    // Response shape:
    // - Default (no sort, no page, no limit provided): array — matches old contract
    // - Paged (any of sort/page/limit provided): object with metadata
    const isPagedRequest = Boolean(sort || page || limit);

    if (isPagedRequest) {
      return res.json({
        data: data || [],
        page: pageNum,
        pageSize,
        total: count ?? (data ? data.length : 0)
      });
    }

    // Legacy array response — keeps existing frontends working
    res.json(data || []);
  } catch (err) {
    console.error('[GET /api/properties] Unexpected error:', err);
    res.status(500).json({ error: 'Could not load properties.' });
  }
});

/* ============================================================
   GET /api/properties/:id
   Returns a single property by UUID.
   ============================================================ */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Reject anything that isn't a plausible UUID up front.
    // This avoids round-tripping malformed IDs to Supabase and lets
    // us return a clean 400 instead of masking a Supabase error as 404.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      return res.status(400).json({ error: 'Invalid property ID.' });
    }

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('[GET /api/properties/:id] Unexpected error:', err);
    res.status(500).json({ error: 'Could not load property.' });
  }
});

module.exports = router;
