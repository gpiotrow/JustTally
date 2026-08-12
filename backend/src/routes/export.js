import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { buildAccountExport } from '../services/exportAccount.js';

const router = Router();

/**
 * GET /api/export — the full account as a `justtally-export/v1` file
 * (exercises referenced by the account's routines/sessions, routines,
 * sessions; body weights once § 10 exists).
 *
 * The client already builds this from IndexedDB and works offline — this
 * exists as the second, server-side path: a device that never synced
 * everything down, or a request for the account's data independent of any
 * one device.
 */
router.get('/', requireAuth, async (req, res) => {
  const file = await buildAccountExport(req.user.sub);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="just-tally-export.json"');
  res.send(JSON.stringify(file, null, 2));
});

export default router;
