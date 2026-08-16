import rateLimit from 'express-rate-limit';

/**
 * Key by the authenticated user rather than IP: every route these limiters
 * guard sits behind `requireAuth`, and several users can legitimately share
 * an IP (office network, campus, carrier-grade NAT) — keying by IP would let
 * one heavy user's window lock out everyone else behind the same address.
 * Falls back to IP only if a limiter were ever mounted ahead of `requireAuth`.
 */
function keyGenerator(req) {
  return req.user?.sub || req.ip;
}

/**
 * Sync endpoints (`/workouts/sync`, `/routines/sync`, `/body-weights/sync`)
 * are event-driven from the client — triggered on reconnect or a manual sync
 * tap, never polled on an interval (see frontend/src/lib/syncedCollection.ts)
 * — so real usage is a handful of calls per session. 100 per 15 minutes stays
 * far above that while still bounding a runaway retry loop or a scripted
 * attempt to load the DB connection pool.
 */
export const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many sync requests. Please try again later.' },
});

/**
 * Upload/import endpoints are CPU- and memory-heavier per request (sharp
 * decode, CSV parse) than a sync call, but a legitimate bulk media import
 * chunks into many small requests — a few hundred exercises' worth of photos
 * at UPLOAD_CHUNK_SIZE=5 per request is over a hundred requests in one
 * sitting (see frontend/src/api/exercises.ts). 200 per 15 minutes comfortably
 * covers that real workflow while still bounding unattended abuse.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many upload requests. Please try again later.' },
});
