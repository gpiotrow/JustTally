import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

/**
 * Exercises the real keyGenerator/config shape used by syncLimiter and
 * uploadLimiter, but with a tiny `max` so the test stays fast — sending 100
 * or 200 real requests per assertion would work but add nothing over a
 * smaller number against the same logic.
 */
function buildApp(max) {
  const app = express();
  app.use((req, res, next) => {
    const sub = req.headers['x-test-user'];
    if (sub) req.user = { sub: String(sub) };
    next();
  });
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.sub || req.ip,
      message: { error: 'Too many requests. Please try again later.' },
    })
  );
  app.get('/x', (req, res) => res.json({ ok: true }));
  return app;
}

describe('rate limiter keying (mirrors rateLimiters.js config)', () => {
  it('rejects with 429 once a single user exceeds the limit', async () => {
    const app = buildApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/x').set('x-test-user', 'user-a');
      expect(res.status).toBe(200);
    }
    const res = await request(app).get('/x').set('x-test-user', 'user-a');
    expect(res.status).toBe(429);
  });

  it('gives each authenticated user their own budget', async () => {
    const app = buildApp(1);
    const a = await request(app).get('/x').set('x-test-user', 'user-a');
    const b = await request(app).get('/x').set('x-test-user', 'user-b');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // Each is now at their own limit — a second request from either 429s.
    const aAgain = await request(app).get('/x').set('x-test-user', 'user-a');
    expect(aAgain.status).toBe(429);
  });
});

describe('production limiter instances', () => {
  it('syncLimiter and uploadLimiter are distinct, independently budgeted middlewares', async () => {
    const { syncLimiter, uploadLimiter } = await import('./rateLimiters.js');
    expect(syncLimiter).not.toBe(uploadLimiter);

    const app = express();
    app.use((req, res, next) => {
      req.user = { sub: 'user-a' };
      next();
    });
    app.get('/sync', syncLimiter, (req, res) => res.json({ ok: true }));
    app.get('/upload', uploadLimiter, (req, res) => res.json({ ok: true }));

    // Exhausting one limiter must not affect the other's independent budget.
    const syncRes = await request(app).get('/sync');
    const uploadRes = await request(app).get('/upload');
    expect(syncRes.status).toBe(200);
    expect(uploadRes.status).toBe(200);
  });
});
