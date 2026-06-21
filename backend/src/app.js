import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initSchema } from './db/database.js';
import { UPLOADS_DIR } from './services/mediaService.js';
import authRoutes from './routes/auth.js';
import exerciseRoutes from './routes/exercises.js';
import userRoutes from './routes/users.js';

initSchema();

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

// 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 200 MB)' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Just Tally API running on http://localhost:${PORT}`);
});
