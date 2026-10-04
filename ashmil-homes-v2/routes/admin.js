const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const router = express.Router();

/* ============================================================
   CONFIG
   ============================================================ */

const JWT_SECRET  = process.env.JWT_SECRET;
const TOKEN_SHORT = '12h';     // when "remember" is unchecked
const TOKEN_LONG  = '7d';      // when "remember" is checked

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Admin authentication will fail. Set it in .env.');
}

/* ============================================================
   AUTH MIDDLEWARE
   Every route below the /login handler requires a valid JWT.
   ============================================================ */

function requireAuth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload; // { id, email, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid session.' });
  }
}

/* ============================================================
   RATE LIMITING (in-memory, per-IP)
   Protects the login route from brute-force attempts.
   For a multi-instance deployment, swap for Redis-backed limiter.
   ============================================================ */

const loginAttempts = new Map(); // ip -> { count, firstAt }
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX       = 5;              // 5 attempts per window

function rateLimitLogin(req, res, next) {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.firstAt > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
    return next();
  }

  if (entry.count >= RATE_MAX) {
    const retrySec = Math.ceil((RATE_WINDOW_MS - (now - entry.firstAt)) / 1000);
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${retrySec} seconds and try again.`
    });
  }

  entry.count += 1;
  next();
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// Periodic cleanup so the Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (now - entry.firstAt > RATE_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref?.();

/* ============================================================
   BOOTSTRAP ADMIN
   Creates a default admin ONLY when env vars are set.
   Never log the password. Never hard-code credentials.
   ============================================================ */

const initAdmin = async () => {
  const email    = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.log('ℹ️  Admin bootstrap skipped (ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD not set).');
    return;
  }

  try {
    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (data) return; // already exists

    const hash = await bcrypt.hash(password, 10);
    const { error: insertError } = await supabase
      .from('admins')
      .insert([{ email, password: hash }]);

    if (insertError) {
      console.error('❌ Error creating admin:', insertError.message);
    } else {
      console.log(`✅ Bootstrap admin created for ${email}. Change the password after first login.`);
    }
  } catch (err) {
    console.error('❌ Admin init error:', err.message);
  }
};
initAdmin();

/* ============================================================
   POST /api/admin/login
   Body: { email, password, remember? }
   Returns: { token, user: { id, email } }
   ============================================================ */

router.post('/login', rateLimitLogin, async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || 'unknown';

    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, email, password')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    // Generic error message — never reveal whether the email exists
    if (error || !admin) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const expiresIn = remember === true || remember === 'true' ? TOKEN_LONG : TOKEN_SHORT;

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      JWT_SECRET,
      { expiresIn }
    );

    clearLoginAttempts(ip);

    res.json({
      token,
      user: { id: admin.id, email: admin.email },
      expiresIn
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ============================================================
   Everything below requires authentication.
   ============================================================ */
router.use(requireAuth);

/* ============================================================
   GET /api/admin/properties
   ============================================================ */

router.get('/properties', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('❌ Error fetching properties:', err.message);
    res.status(500).json({ error: 'Could not load properties.' });
  }
});

/* ============================================================
   POST /api/admin/properties
   Creates a new property.
   ============================================================ */

router.post('/properties', async (req, res) => {
  try {
    const {
      title, description, price, location, category,
      bedrooms, bathrooms, area, featured,
      images, video, features
    } = req.body || {};

    // --- Validation ---
    const missing = [];
    if (!title) missing.push('title');
    if (!description) missing.push('description');
    if (!price) missing.push('price');
    if (!location) missing.push('location');
    if (!category) missing.push('category');

    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const allowedCategories = ['houses', 'land', 'shortlets', 'flats'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category.' });
    }

    // --- Normalize arrays ---
    const imageArray = Array.isArray(images)
      ? images.filter(Boolean).map(String)
      : String(images || '').split('\n').map(s => s.trim()).filter(Boolean);

    const featuresArray = Array.isArray(features)
      ? features.filter(Boolean).map(String)
      : String(features || '').split('\n').map(s => s.trim()).filter(Boolean);

    const propertyData = {
      title:       String(title).trim(),
      description: String(description).trim(),
      price:       String(price).trim(),                // keep as text (see note below)
      location:    String(location).trim(),
      category,
      bedrooms:    Number(bedrooms) || 0,
      bathrooms:   Number(bathrooms) || 0,
      area:        area ? String(area).trim() : '',
      featured:    featured === true || featured === 'true',
      images:      imageArray,
      video:       video ? String(video).trim() : '',
      features:    featuresArray
    };

    const { data, error } = await supabase
      .from('properties')
      .insert([propertyData])
      .select();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ error: 'Could not save property.' });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('❌ Error saving property:', err);
    res.status(500).json({ error: 'Could not save property.' });
  }
});

/* ============================================================
   PUT /api/admin/properties/:id
   Updates an existing property.
   ============================================================ */

router.put('/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      return res.status(400).json({ error: 'Invalid property ID.' });
    }

    const body = req.body || {};
    const updates = {};

    // Whitelist updatable fields — never allow arbitrary keys to be set
    const allowedFields = [
      'title', 'description', 'price', 'location', 'category',
      'bedrooms', 'bathrooms', 'area', 'featured', 'images', 'video', 'features'
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;

      if (field === 'images' || field === 'features') {
        const raw = body[field];
        updates[field] = Array.isArray(raw)
          ? raw.filter(Boolean).map(String)
          : String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      } else if (field === 'bedrooms' || field === 'bathrooms') {
        updates[field] = Number(body[field]) || 0;
      } else if (field === 'featured') {
        updates[field] = body[field] === true || body[field] === 'true';
      } else if (field === 'category') {
        const allowedCategories = ['houses', 'land', 'shortlets', 'flats'];
        if (allowedCategories.includes(body[field])) updates[field] = body[field];
      } else {
        updates[field] = String(body[field]).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || !data.length) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('❌ Error updating property:', err);
    res.status(500).json({ error: 'Could not update property.' });
  }
});

/* ============================================================
   DELETE /api/admin/properties/:id
   Deletes a property.
   NOTE: does not delete associated Storage images. Those remain
   in Supabase Storage so we don't destroy files that might be
   referenced elsewhere. A cleanup job can handle orphans later.
   ============================================================ */

router.delete('/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      return res.status(400).json({ error: 'Invalid property ID.' });
    }

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('❌ Error deleting property:', err);
    res.status(500).json({ error: 'Could not delete property.' });
  }
});

module.exports = router;
