require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI environment variable not set. Exiting.');
  process.exit(1);
}
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.error('URI:', mongoUri.split('@')[0] + '@****'); // Log URI without password
  });
const port = process.env.PORT || 3000;

// Basic middleware with CSP configured for external scripts and inline handlers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:*"],
      frameSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(morgan('tiny'));

// Serve project static files (for local development). This lets you open the site via the server
const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot));

// Also serve admin.html from server folder
app.use(express.static(path.join(__dirname)));

// Simple health check
app.get('/_health', (req, res) => res.send({ ok: true }));

// Database connection status endpoint
app.get('/api/status', (req, res) => {
  const status = {
    ok: true,
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  if (mongoose.connection.readyState !== 1) {
    status.ok = false;
  }
  res.json(status);
});

// POST endpoint to receive contact form submissions
app.post('/api/contact', async (req, res) => {
  const { name, email, company, message } = req.body || {};

  if (!email || !name) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  try {
    const submission = new Submission({
      name: name.trim(),
      company: company ? company.trim() : '',
      email: email.trim(),
      message: message ? message.trim() : ''
    });
    await submission.save();
    res.status(201).json({ id: submission._id, success: true });
  } catch (err) {
    console.error('DB insert failed', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Basic admin endpoint to list submissions. Protect with a simple header key.
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'dev-secret';
// In-memory session store for admin sessions (simple, non-persistent)
const SESSIONS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour

function createSession() {
  const id = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  SESSIONS.set(id, { createdAt: now, expires });
  return id;
}

function isSessionValid(id) {
  if (!id) return false;
  const s = SESSIONS.get(id);
  if (!s) return false;
  if (Date.now() > s.expires) {
    SESSIONS.delete(id);
    return false;
  }
  return true;
}

function requireAdminAuth(req, res, next) {
  // Allow API key as before
  const key = req.get('x-api-key');
  if (key && key === ADMIN_KEY) return next();

  // Otherwise check for admin session cookie
  const cookieHeader = req.get('cookie') || '';
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('admin_sid='));
  if (!match) return res.status(401).json({ error: 'unauthorized' });
  const sid = match.split('=')[1];
  if (!isSessionValid(sid)) return res.status(401).json({ error: 'unauthorized' });
  // refresh expiry on activity
  const sess = SESSIONS.get(sid);
  sess.expires = Date.now() + SESSION_TTL_MS;
  SESSIONS.set(sid, sess);
  next();
}

app.get('/admin/submissions', requireAdminAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'database not connected' });
    }
    const rows = await Submission.find().sort({ createdAt: -1 }).exec();
    res.json({ rows });
  } catch (err) {
    console.error('DB read failed', err.message);
    res.status(500).json({ error: 'database error', message: err.message });
  }
});

// Some hosts/proxies may block GET requests to API-like paths; accept POST as a mirror for compatibility
app.post('/admin/submissions', requireAdminAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'database not connected' });
    }
    const rows = await Submission.find().sort({ createdAt: -1 }).exec();
    res.json({ rows });
  } catch (err) {
    console.error('DB read failed (POST mirror)', err.message);
    res.status(500).json({ error: 'database error', message: err.message });
  }
});

// DELETE endpoint to remove a submission by ID
app.delete('/admin/submissions/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'submission id required' });
    }
    const result = await Submission.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: 'submission not found' });
    }
    res.json({ ok: true, message: 'submission deleted' });
  } catch (err) {
    console.error('DB delete failed', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Verify admin password (used by client-side login modal)
app.post('/admin/verify', (req, res) => {
  try {
    const password = (req.body && req.body.password) || '';
    const expected = process.env.ADMIN_PANEL_PASSWORD || 'admin1234';
    if (password && password === expected) {
      // create a short-lived session and set an HttpOnly cookie
      try {
        const sid = createSession();
        const oneHour = SESSION_TTL_MS;
        // set cookie options; secure only in production when using HTTPS
        const cookieOpts = {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: oneHour
        };
        if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
        res.cookie('admin_sid', sid, cookieOpts);
      } catch (err) {
        console.error('Session create failed', err);
      }
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: 'unauthorized' });
  } catch (err) {
    console.error('Verify endpoint error', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Logout endpoint to destroy admin session
app.post('/admin/logout', (req, res) => {
  try {
    const cookieHeader = req.get('cookie') || '';
    const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('admin_sid='));
    if (match) {
      const sid = match.split('=')[1];
      if (sid && SESSIONS.has(sid)) SESSIONS.delete(sid);
    }
    res.clearCookie('admin_sid', { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Logout error', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Serve admin.html explicitly at /admin.html (some hosts may not expose server folder statically)
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(port, () => {
  console.log(`Prefiction server listening on http://localhost:${port}`);
  console.log(`Serving static files from ${staticRoot}`);
});
