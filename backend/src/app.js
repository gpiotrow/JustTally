import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema } from './db/database.js';
import { UPLOADS_DIR } from './services/storage/index.js';
import authRoutes from './routes/auth.js';
import exerciseRoutes from './routes/exercises.js';
import userRoutes from './routes/users.js';
import workoutRoutes from './routes/workouts.js';
import favoriteRoutes from './routes/favorites.js';
import routineRoutes from './routes/routines.js';

await initSchema();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
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
    return res.status(413).json({ error: 'File too large (max 200 MB)' });
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
