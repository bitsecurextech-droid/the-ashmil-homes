const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

/* ============================================================
   CONFIG
   ============================================================ */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const EMAIL_USER         = process.env.EMAIL_USER;
const EMAIL_PASS         = process.env.EMAIL_PASS;

const telegramEnabled = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
const emailEnabled    = Boolean(EMAIL_USER && EMAIL_PASS);

if (!telegramEnabled && !emailEnabled) {
  console.warn('⚠️  Contact form: neither Telegram nor Email is configured. Submissions will be accepted but not delivered.');
} else {
  if (telegramEnabled) console.log('✅ Contact form: Telegram notifications enabled.');
  if (emailEnabled)    console.log('✅ Contact form: Email notifications enabled.');
}

/* ============================================================
   EMAIL TRANSPORTER (optional)
   ============================================================ */

let transporter = null;
if (emailEnabled) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
}

/* ============================================================
   RATE LIMITING (in-memory, per-IP)
   3 submissions per 10 minutes — tune as needed.
   ============================================================ */

const submissions = new Map(); // ip -> { count, firstAt }
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX       = 3;

function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || 'unknown';
  const now = Date.now();
  const entry = submissions.get(ip);

  if (!entry || now - entry.firstAt > RATE_WINDOW_MS) {
    submissions.set(ip, { count: 1, firstAt: now });
    return next();
  }

  if (entry.count >= RATE_MAX) {
    const retrySec = Math.ceil((RATE_WINDOW_MS - (now - entry.firstAt)) / 1000);
    return res.status(429).json({
      success: false,
      error: `Too many messages. Please wait ${Math.ceil(retrySec / 60)} minute(s) and try again.`
    });
  }

  entry.count += 1;
  next();
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of submissions.entries()) {
    if (now - entry.firstAt > RATE_WINDOW_MS) submissions.delete(ip);
  }
}, 5 * 60 * 1000).unref?.();

/* ============================================================
   HELPERS
   ============================================================ */

const LIMITS = {
  name:    100,
  email:   254,
  phone:   30,
  message: 4000
};

function truncate(str, max) {
  return String(str).slice(0, max);
}

function escapeTelegramHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

/* ============================================================
   TELEGRAM SENDER
   Sends a formatted message to your configured chat.
   Uses HTML parse mode; all user content is escaped first.
   ============================================================ */

async function sendToTelegram({ name, email, phone, message, ip }) {
  const timestamp = new Date().toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const text = [
    '<b>New Enquiry — Ashmil Homes</b>',
    '',
    `<b>Name:</b> ${escapeTelegramHtml(name)}`,
    `<b>Email:</b> ${escapeTelegramHtml(email)}`,
    phone ? `<b>Phone:</b> ${escapeTelegramHtml(phone)}` : null,
    '',
    '<b>Message:</b>',
    escapeTelegramHtml(message),
    '',
    `<i>Received ${escapeTelegramHtml(timestamp)}</i>`
  ].filter(Boolean).join('\n');

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.description || `Telegram API responded ${res.status}`);
    }

    return { ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
   EMAIL SENDER (optional fallback)
   ============================================================ */

async function sendToEmail({ name, email, phone, message }) {
  await transporter.sendMail({
    from: `"Ashmil Homes Enquiry" <${EMAIL_USER}>`,   // from YOUR address, not the visitor's
    replyTo: `"${name}" <${email}>`,                  // so you can hit reply and it goes to them
    to: EMAIL_USER,
    subject: `New enquiry from ${name}`,
    text: [
      `Name:  ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || '—'}`,
      '',
      message
    ].join('\n')
  });
}

/* ============================================================
   POST /api/contact
   Body: { name, email, phone?, message, source?, timestamp? }
   Returns: { success: true } on delivery, { success: false, error } otherwise.
   ============================================================ */

router.post('/', rateLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || 'unknown';

    // --- Extract + trim ---
    const name    = String(body.name    || '').trim();
    const email   = String(body.email   || '').trim();
    const phone   = String(body.phone   || '').trim();
    const message = String(body.message || '').trim();

    // --- Validation ---
    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your full name.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ success: false, error: 'Please enter a message (at least 10 characters).' });
    }

    // --- Length caps ---
    const payload = {
      name:    truncate(name,    LIMITS.name),
      email:   truncate(email,   LIMITS.email),
      phone:   truncate(phone,   LIMITS.phone),
      message: truncate(message, LIMITS.message),
      ip
    };

    // --- Attempt delivery ---
    const results = { telegram: null, email: null };
    const errors  = [];

    if (telegramEnabled) {
      try {
        await sendToTelegram(payload);
        results.telegram = 'ok';
      } catch (err) {
        results.telegram = 'failed';
        errors.push(`telegram: ${err.message}`);
        console.error('❌ Telegram send failed:', err.message);
      }
    }

    if (emailEnabled) {
      try {
        await sendToEmail(payload);
        results.email = 'ok';
      } catch (err) {
        results.email = 'failed';
        errors.push(`email: ${err.message}`);
        console.error('❌ Email send failed:', err.message);
      }
    }

    // --- No delivery channel configured ---
    if (!telegramEnabled && !emailEnabled) {
      console.error('❌ Contact form received but no delivery channel is configured.');
      return res.status(500).json({
        success: false,
        error: 'Message system is not configured. Please contact us directly via WhatsApp or phone.'
      });
    }

    // --- Success if AT LEAST ONE channel succeeded ---
    const anySucceeded = results.telegram === 'ok' || results.email === 'ok';

    if (anySucceeded) {
      return res.json({ success: true });
    }

    // --- All channels failed ---
    console.error('❌ All delivery channels failed:', errors);
    return res.status(500).json({
      success: false,
      error: 'Could not deliver your message. Please try again or reach us on WhatsApp.'
    });

  } catch (err) {
    console.error('❌ Contact route error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
