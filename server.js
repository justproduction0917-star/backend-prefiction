require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Admin = require('./models/Admin');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  w: 'majority',
  family: 4
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.error('URI:', mongoUri.split('@')[0] + '@****'); // Log URI without password
  });
const port = process.env.PORT || 3000;

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'theprefictionsolution@gmail.com',
    pass: process.env.GMAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD
  }
});

// Verify transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.log('Email service error:', error.message);
  } else {
    console.log('Email service ready');
  }
});

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

// CORS configuration with explicit origin matching
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = ['https://prefiction-fronted.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];
    // Allow requests with no origin (like mobile apps or curl requests)
    // Allow all Vercel deployments
    if (!origin || origin.includes('vercel.app') || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow anyway for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(morgan('tiny'));

// Serve project static files (for local development). This lets you open the site via the server
const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot));

// Also serve admin.html from server folder
app.use(express.static(path.join(__dirname)));

// Root route - redirect to admin panel
app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

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

// Function to get admin password from MongoDB or environment
async function getAdminPassword() {
  try {
    if (mongoose.connection.readyState === 1) {
      const adminSettings = await Admin.findOne({ key: 'admin_settings' });
      if (adminSettings && adminSettings.password) {
        return adminSettings.password;
      }
    }
  } catch (err) {
    console.error('Error fetching admin password from DB:', err.message);
  }
  // Fallback to environment variable
  return process.env.ADMIN_PANEL_PASSWORD || '57d3e160e7b006b0359fa54440799a6b';
}

// Verify admin password (used by client-side login modal)
app.post('/admin/verify', async (req, res) => {
  try {
    const password = (req.body && req.body.password) || '';
    const expected = await getAdminPassword();
    if (password && password === expected) {
      // create a short-lived session and set an HttpOnly cookie
      try {
        const sid = createSession();
        const oneHour = SESSION_TTL_MS;
        // set cookie options; secure only in production when using HTTPS
        const cookieOpts = {
          httpOnly: true,
          sameSite: 'none',
          secure: true,
          maxAge: oneHour
        };
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


// Change admin password endpoint
app.post('/admin/change-password', requireAdminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const expectedPassword = await getAdminPassword();

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (currentPassword !== expectedPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Update the environment variable
    process.env.ADMIN_PANEL_PASSWORD = newPassword;
    
    // Persist to MongoDB for permanent storage across deployments
    if (mongoose.connection.readyState === 1) {
      try {
        await Admin.findOneAndUpdate(
          { key: 'admin_settings' },
          { password: newPassword, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        console.log('Admin password updated in database');
      } catch (dbErr) {
        console.error('Failed to update password in database:', dbErr.message);
      }
    }
    
    // Clear all sessions to force re-login
    SESSIONS.clear();
    
    res.clearCookie('admin_sid', { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    console.error('Change password error', err);
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

// Admin access notification endpoint
app.post('/api/admin-access', (req, res) => {
  try {
    const { ip, userAgent, timestamp } = req.body;
    const clientIp = ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    const mailOptions = {
      from: process.env.GMAIL_USER || 'theprefictionsolution@gmail.com',
      to: 'justproduction0917@gmail.com',
      subject: '🔐 Admin Panel Access Notification',
      html: `
        <div style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
          <div style="background: white; border-radius: 8px; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c; margin-top: 0;">⚠️ Admin Panel Accessed</h2>
            <p style="color: #333; font-size: 16px;">Someone has accessed your admin panel.</p>
            
            <div style="background: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 10px 0;"><strong>IP Address:</strong> ${clientIp}</p>
              <p style="margin: 10px 0;"><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
              <p style="margin: 10px 0;"><strong>Device:</strong> ${userAgent || 'Unknown'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If this wasn't you, please check your account security immediately.
            </p>
            
            <div style="border-top: 1px solid #ecf0f1; margin-top: 20px; padding-top: 20px; color: #999; font-size: 12px;">
              <p>This is an automated notification from your Prefiction admin system.</p>
            </div>
          </div>
        </div>
      `
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email sending error:', error);
        return res.status(500).json({ success: false, error: error.message });
      } else {
        console.log('Admin access notification sent:', info.response);
        return res.json({ success: true, message: 'Notification sent' });
      }
    });
  } catch (err) {
    console.error('Admin access notification error', err);
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
