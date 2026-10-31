const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const session = require('express-session');
const flash = require('connect-flash');
const rateLimit = require('express-rate-limit');
const MySQLStore = require('express-mysql-session')(session);

// Load environment variables
dotenv.config();

const { pool, testConnection, dbConfig } = require('./db/pool');
const csrfMiddleware = require('./middleware/csrf');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const donorRoutes = require('./routes/donors');
const hospitalRoutes = require('./routes/hospitals');
const donationRoutes = require('./routes/donations');
const inventoryRoutes = require('./routes/inventory');
const requestRoutes = require('./routes/requests');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (e.g. Render, Heroku) for HTTPS headers & rate limiter client IP
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Security headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false // Disabled for local inline styles / script tags in coursework
  })
);

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));

// Configure session store using MySQL
let sessionStore;
try {
  sessionStore = new MySQLStore(
    {
      clearExpired: true,
      checkExpirationInterval: 900000,
      expiration: 86400000,
      createDatabaseTable: true,
      schema: {
        tableName: 'sessions',
        columnNames: {
          session_id: 'session_id',
          expires: 'expires',
          data: 'data'
        }
      }
    },
    pool
  );
} catch (err) {
  console.warn('[Session Warning] Using MemoryStore fallback:', err.message);
}

app.use(
  session({
    key: 'blood_bank_sid',
    secret: process.env.SESSION_SECRET || 'college-dbms-session-secret-key-2026',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true behind HTTPS in production
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      sameSite: 'lax'
    }
  })
);

// Connect Flash messages
app.use(flash());

// Native CSRF Protection
app.use(csrfMiddleware);

// Global view variables
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.currentPath = req.path;
  next();
});

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Login rate limiting (15 attempts per 15 mins)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Mount Routes
app.use('/login', loginLimiter);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/donors', donorRoutes);
app.use('/hospitals', hospitalRoutes);
app.use('/donations', donationRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/requests', requestRoutes);
app.use('/reports', reportRoutes);

// Health check endpoint for Render monitoring and uptime checks
app.get('/healthz', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS alive');
    res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// Home route redirect
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).send(`
    <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center; text-align: center; font-family: sans-serif;">
      <div>
        <h1 style="font-size: 3rem; color: #dc2626; margin-bottom: 0.5rem;">404</h1>
        <h2>Page Not Found</h2>
        <p style="color: #64748b; margin-bottom: 1.5rem;">The requested URL ${req.originalUrl} does not exist.</p>
        <a href="/dashboard" style="display: inline-block; padding: 0.6rem 1.2rem; background-color: #0f172a; color: #fff; text-decoration: none; border-radius: 6px;">Return to Dashboard</a>
      </div>
    </div>
  `);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).send(`
    <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 40px auto; border: 1px solid #fca5a5; background-color: #fef2f2; border-radius: 8px;">
      <h2 style="color: #991b1b;">500 Internal Server Error</h2>
      <p style="color: #7f1d1d;">An unexpected server error occurred: ${err.message}</p>
      <a href="/dashboard" style="color: #dc2626; font-weight: bold;">&larr; Back to Dashboard</a>
    </div>
  `);
});

// Start Server
if (require.main === module) {
  testConnection().then((connected) => {
    const server = app.listen(PORT, () => {
      console.log(`
========================================================================
🩸 BLOOD BANK MANAGEMENT SYSTEM
------------------------------------------------------------------------
🚀 Server running at: http://localhost:${PORT}
💾 Database: ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}
👤 Demo Accounts:
   - Administrator: admin / Admin@123
   - Staff Member:  staff / Staff@123
========================================================================
      `);
    });

    // Graceful shutdown on SIGTERM / SIGINT for zero-downtime deploys
    const gracefulShutdown = (signal) => {
      console.log(`[Server] Received ${signal}. Closing HTTP server and database pool...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('[Server] Database pool closed successfully.');
        } catch (err) {
          console.error('[Server Error during shutdown]', err);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  });
}

module.exports = app;
