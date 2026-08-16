import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema } from './db/database.js';
import { UPLOADS_DIR } from './services/storage/index.js';
import authRoutes from './routes/auth.js';
import exerciseRoutes, { MAX_UPLOAD_FILE_SIZE } from './routes/exercises.js';
import userRoutes from './routes/users.js';
import workoutRoutes from './routes/workouts.js';
import favoriteRoutes from './routes/favorites.js';
import routineRoutes from './routes/routines.js';
import exportRoutes from './routes/export.js';
import bodyWeightRoutes from './routes/bodyWeights.js';

await initSchema();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// The R2/CDN origin media is served from when MEDIA_DRIVER=r2, e.g.
// https://media.justtally.org (see services/storage/r2Driver.js). Absent with
// the local driver, in which case media stays same-origin under /uploads and
// needs no extra CSP entry.
const mediaOrigin = process.env.MEDIA_PUBLIC_BASE_URL || null;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline': index.html's only inline script (theme flash
        // prevention) was moved to public/theme-init.js for exactly this.
        scriptSrc: ["'self'"],
        // React writes computed values via the style prop as inline style
        // attributes (PlateCalculator, RestTimerBar, Recovery, Settings) —
        // 'unsafe-inline' here is the documented tradeoff, not an oversight.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', ...(mediaOrigin ? [mediaOrigin] : [])],
        mediaSrc: ["'self'", 'blob:', ...(mediaOrigin ? [mediaOrigin] : [])],
        connectSrc: ["'self'", ...(mediaOrigin ? [mediaOrigin] : [])],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Same-origin API + SPA: cross-origin embedding of our own resources by
    // our own pages is not a threat model this app has, and COEP/CORP default
    // to blocking cross-origin image/font loads that legitimately happen here
    // (Google Fonts, the R2 media CDN).
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    // Matches the stricter CSP frame-ancestors 'none' above; DENY is the
    // legacy header modern browsers ignore in favor of the CSP directive, but
    // it's the one still honored by older ones.
    frameguard: { action: 'deny' },
  })
);

// `true` would reflect any Origin header, letting any website call the API
// on a visitor's behalf as long as it has a token. Production doesn't need
// cross-origin access at all — Express serves the built SPA itself, so API
// and app share an origin — so an unset CLIENT_ORIGIN falls back to "none"
// rather than "everyone". Only local dev (Vite on a different port) sets it.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || false,
  })
);
app.use(express.json({ limit: '2mb' }));

// Serve uploaded media with permissive CORS so the PWA can cache them.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  },
  express.static(UPLOADS_DIR)
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/body-weights', bodyWeightRoutes);

// Serve frontend static files (production build)
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// Media that no longer exists must fail fast. Without this the request falls
// through to the SPA catch-all, which answers nothing at all for /uploads — the
// connection then hangs until the client gives up, and a handful of dead image
// links is enough to exhaust a browser's per-origin connection limit.
app.use('/uploads', (req, res) => {
  res.status(404).json({ error: 'Media not found' });
});

// Must be registered before the catch-all: app.get('*') matches GET /api/... too.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback: everything else is a client-side route.
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ error: `File too large (max ${MAX_UPLOAD_FILE_SIZE / (1024 * 1024)} MB)` });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Too many files in one upload' });
  }
  // Deliberate client errors (e.g. ref validation/collision) carry a status + safe message.
  const status = err.status || err.statusCode;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Just Tally API running on http://localhost:${PORT}`);
});
