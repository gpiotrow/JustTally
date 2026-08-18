import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import { processImage, processVideo } from '../services/mediaService.js';

/**
 * Queries are matched by shape rather than call order: the routes under test
 * issue a different number of queries depending on which branch they take, and
 * an ordered mock chain would make the archive-vs-delete decision — the exact
 * thing these tests exist to verify — invisible.
 */
const handlers = [];
const queryMock = vi.fn(async (sql, params) => {
  // Newest first, so a test can override a default registered in beforeEach.
  for (let i = handlers.length - 1; i >= 0; i--) {
    const [pattern, respond] = handlers[i];
    if (pattern.test(sql)) return respond(sql, params);
  }
  throw new Error(`No mock handler for query: ${sql.slice(0, 120)}`);
});
function onQuery(pattern, respond) {
  handlers.push([pattern, respond]);
}

vi.mock('../db/database.js', () => ({
  default: { query: (...args) => queryMock(...args) },
}));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'admin-1', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

const deleteMediaFiles = vi.fn(async () => {});
vi.mock('../services/mediaService.js', () => ({
  processImage: vi.fn(),
  processVideo: vi.fn(),
  deleteMediaFiles: (...args) => deleteMediaFiles(...args),
  mediaUrl: (key, storage, stored) => (key ? `/uploads/${key}` : stored),
}));

const { default: exercisesRouter } = await import('./exercises.js');

const app = express();
app.use(express.json());
app.use('/api/exercises', exercisesRouter);
// Mirrors app.js's central error handler: routes that `throw` (as opposed to
// `res.status().json()`) rely on this to turn `err.status` into a real HTTP
// response instead of an unhandled rejection.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const exercise = {
  id: 'ex-1',
  ref: 42,
  name: 'Bench Press',
  name_de: 'Bankdrücken',
  name_en: 'Bench Press',
  category: 'chest',
  difficulty: 'intermediate',
  instructions: '',
  created_at: 1,
  updated_at: 1,
  archived_at: null,
};

/** Register the usage-count query with a fixed answer per exercise id. */
function mockUsage(byId) {
  onQuery(/FROM unnest/, (_sql, [ids]) => ({
    rows: ids.map((id) => ({
      exercise_id: id,
      workouts: byId[id]?.workouts ?? 0,
      users: byId[id]?.users ?? 0,
    })),
  }));
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  deleteMediaFiles.mockClear();
  onQuery(/SELECT \* FROM media WHERE exercise_id = ANY/, () => ({ rows: [] }));
});

describe('DELETE /api/exercises/:id — invariant I3', () => {
  it('archives instead of deleting when a workout still references it', async () => {
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [exercise] }));
    mockUsage({ 'ex-1': { workouts: 3, users: 2 } });
    let archiveParams = null;
    onQuery(/UPDATE exercises SET archived_at/, (_sql, params) => {
      archiveParams = params;
      return { rowCount: 1 };
    });

    const res = await request(app).delete('/api/exercises/ex-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      archived: true,
      deleted: false,
      usage: { workouts: 3, users: 2 },
    });
    expect(archiveParams).not.toBeNull();

    const ranDelete = queryMock.mock.calls.some(([sql]) => /DELETE FROM exercises/.test(sql));
    expect(ranDelete).toBe(false);
    expect(deleteMediaFiles).not.toHaveBeenCalled();
  });

  it('reports how many distinct users are affected, not just that it is in use', async () => {
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [exercise] }));
    mockUsage({ 'ex-1': { workouts: 7, users: 4 } });
    onQuery(/UPDATE exercises SET archived_at/, () => ({ rowCount: 1 }));

    const res = await request(app).delete('/api/exercises/ex-1');

    expect(res.body.usage.users).toBe(4);
  });

  it('bumps updated_at when archiving, so `?since=` clients learn about it', async () => {
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [exercise] }));
    mockUsage({ 'ex-1': { workouts: 1, users: 1 } });
    let sql = null;
    onQuery(/UPDATE exercises SET archived_at/, (s) => {
      sql = s;
      return { rowCount: 1 };
    });

    await request(app).delete('/api/exercises/ex-1');

    expect(sql).toMatch(/updated_at = \$1/);
  });

  it('deletes outright, media included, when nothing references it', async () => {
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [exercise] }));
    mockUsage({ 'ex-1': { workouts: 0, users: 0 } });
    onQuery(/SELECT \* FROM media WHERE exercise_id = ANY/, () => ({
      rows: [{ id: 'm1', storage: 'local', object_key: 'img/a.webp', thumb_key: null }],
    }));
    onQuery(/DELETE FROM exercises/, () => ({ rowCount: 1 }));

    const res = await request(app).delete('/api/exercises/ex-1');

    expect(res.body).toMatchObject({ archived: false, deleted: true });
    expect(deleteMediaFiles).toHaveBeenCalledOnce();
  });

  it('404s for an unknown exercise without counting usage', async () => {
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [] }));

    const res = await request(app).delete('/api/exercises/ghost');

    expect(res.status).toBe(404);
    expect(queryMock.mock.calls.some(([sql]) => /FROM unnest/.test(sql))).toBe(false);
  });
});

describe('POST /api/exercises/bulk-delete', () => {
  it('splits a mixed selection into archived and deleted', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = ANY/, () => ({
      rows: [{ id: 'used' }, { id: 'unused' }],
    }));
    mockUsage({ used: { workouts: 2, users: 1 }, unused: { workouts: 0, users: 0 } });
    onQuery(/UPDATE exercises SET archived_at/, () => ({ rowCount: 1 }));
    onQuery(/DELETE FROM exercises/, () => ({ rowCount: 1 }));

    const res = await request(app)
      .post('/api/exercises/bulk-delete')
      .send({ ids: ['used', 'unused'] });

    expect(res.body).toEqual({ archived: 1, deleted: 1 });
  });

  it('only ever hard-deletes the unreferenced ids', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = ANY/, () => ({
      rows: [{ id: 'used' }, { id: 'unused' }],
    }));
    mockUsage({ used: { workouts: 5, users: 3 }, unused: { workouts: 0, users: 0 } });
    onQuery(/UPDATE exercises SET archived_at/, () => ({ rowCount: 1 }));
    let deletedIds = null;
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => {
      deletedIds = ids;
      return { rowCount: 1 };
    });

    await request(app).post('/api/exercises/bulk-delete').send({ ids: ['used', 'unused'] });

    expect(deletedIds).toEqual(['unused']);
  });

  it('rejects an empty id list', async () => {
    const res = await request(app).post('/api/exercises/bulk-delete').send({ ids: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/exercises — archived visibility', () => {
  beforeEach(() => {
    onQuery(/SELECT \* FROM exercises/, () => ({ rows: [] }));
  });

  it('hides archived exercises from the default catalog listing', async () => {
    await request(app).get('/api/exercises');
    const [sql] = queryMock.mock.calls.find(([s]) => /SELECT \* FROM exercises/.test(s));
    expect(sql).toMatch(/archived_at IS NULL/);
  });

  it('includes them when the admin view asks for them', async () => {
    await request(app).get('/api/exercises?includeArchived=1');
    const [sql] = queryMock.mock.calls.find(([s]) => /SELECT \* FROM exercises/.test(s));
    expect(sql).not.toMatch(/archived_at IS NULL/);
  });

  it('includes them in a ?since= sync, so clients are told about an archival', async () => {
    await request(app).get('/api/exercises?since=1000');
    const [sql, params] = queryMock.mock.calls.find(([s]) => /SELECT \* FROM exercises/.test(s));
    expect(sql).not.toMatch(/archived_at IS NULL/);
    expect(sql).toMatch(/updated_at > \$1/);
    expect(params).toEqual([1000]);
  });

  it('combines category and since instead of letting one shadow the other', async () => {
    await request(app).get('/api/exercises?category=chest&since=500');
    const [sql, params] = queryMock.mock.calls.find(([s]) => /SELECT \* FROM exercises/.test(s));
    expect(sql).toMatch(/category = \$1/);
    expect(sql).toMatch(/updated_at > \$2/);
    expect(params).toEqual(['chest', 500]);
  });
});

describe('POST /api/exercises/:id/unarchive', () => {
  it('clears archived_at and returns the restored exercise', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, archived_at: null }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');

    expect(res.status).toBe(200);
    expect(res.body.exercise.archived).toBe(false);
  });

  it('404s for an unknown exercise', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({ rows: [] }));
    const res = await request(app).post('/api/exercises/ghost/unarchive');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/exercises/:id/usage', () => {
  it('reports workout and user counts without changing anything', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [{ id: 'ex-1' }] }));
    mockUsage({ 'ex-1': { workouts: 9, users: 5 } });

    const res = await request(app).get('/api/exercises/ex-1/usage');

    expect(res.body.usage).toEqual({ workouts: 9, users: 5 });
    const mutated = queryMock.mock.calls.some(([sql]) => /UPDATE|DELETE|INSERT/.test(sql));
    expect(mutated).toBe(false);
  });
});

describe('muscle groups', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, muscles_primary: JSON.parse(params[12]), muscles_secondary: JSON.parse(params[13]) }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back valid muscle lists', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', musclesPrimary: ['chest'], musclesSecondary: ['triceps', 'front_delts'] });

    expect(res.status).toBe(201);
    expect(res.body.exercise.musclesPrimary).toEqual(['chest']);
    expect(res.body.exercise.musclesSecondary).toEqual(['triceps', 'front_delts']);
  });

  it('defaults both lists to empty when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.musclesPrimary).toEqual([]);
    expect(res.body.exercise.musclesSecondary).toEqual([]);
  });

  it.each([
    ['an unknown code', { musclesPrimary: ['pecs'] }],
    ['a non-array', { musclesPrimary: 'chest' }],
    ['a duplicate entry', { musclesPrimary: ['chest', 'chest'] }],
    ['a non-string element', { musclesPrimary: [42] }],
    ['an invalid secondary list', { musclesSecondary: ['nope'] }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });

  it('reads a row written before the columns existed as empty lists', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, muscles_primary: null, muscles_secondary: undefined }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');
    expect(res.body.exercise.musclesPrimary).toEqual([]);
    expect(res.body.exercise.musclesSecondary).toEqual([]);
  });
});

describe('equipment', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, equipment: JSON.parse(params[14]) }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back a valid equipment list', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', equipment: ['barbell', 'bench'] });

    expect(res.status).toBe(201);
    expect(res.body.exercise.equipment).toEqual(['barbell', 'bench']);
  });

  it('defaults to an empty list when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.equipment).toEqual([]);
  });

  it.each([
    ['an unknown code', { equipment: ['treadmill'] }],
    ['a non-array', { equipment: 'barbell' }],
    ['a duplicate entry', { equipment: ['barbell', 'barbell'] }],
    ['a non-string element', { equipment: [42] }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });

  it('reads a row written before the column existed as an empty list', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, equipment: null }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');
    expect(res.body.exercise.equipment).toEqual([]);
  });
});

describe('category', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, category: params[6] }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back a valid category', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', category: 'legs' });

    expect(res.status).toBe(201);
    expect(res.body.exercise.category).toBe('legs');
  });

  it('defaults to "other" when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.category).toBe('other');
  });

  it.each([
    ['an unknown code', { category: 'shoulders_and_back' }],
    ['an explicit empty string', { category: '' }],
    ['a non-string value', { category: 42 }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });
});

describe('goals', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, goals: JSON.parse(params[15]) }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back a valid goals list', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', goals: ['strength', 'muscle_gain'] });

    expect(res.status).toBe(201);
    expect(res.body.exercise.goals).toEqual(['strength', 'muscle_gain']);
  });

  it('defaults to an empty list when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.goals).toEqual([]);
  });

  it.each([
    ['an unknown code', { goals: ['endurance'] }],
    ['a non-array', { goals: 'strength' }],
    ['a duplicate entry', { goals: ['strength', 'strength'] }],
    ['a non-string element', { goals: [42] }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });

  it('reads a row written before the column existed as an empty list', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, goals: null }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');
    expect(res.body.exercise.goals).toEqual([]);
  });
});

describe('tracking', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, tracking: params[16] }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back a valid tracking mode', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Unterarmstütz', tracking: 'time' });

    expect(res.status).toBe(201);
    expect(res.body.exercise.tracking).toBe('time');
  });

  it('defaults to "reps_weight" when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.tracking).toBe('reps_weight');
  });

  it.each([
    ['an unknown code', { tracking: 'laps' }],
    ['a non-string value', { tracking: 42 }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });

  it('reads a row written before the column existed as "reps_weight"', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, tracking: null }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');
    expect(res.body.exercise.tracking).toBe('reps_weight');
  });
});

describe('machine settings', () => {
  /** Let a create succeed: no ref collision, insert echoes a row back. */
  function mockCreateSucceeds() {
    onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 99 }] }));
    onQuery(/INSERT INTO exercises/, (_sql, params) => ({
      rows: [{ ...exercise, settings: JSON.parse(params[17]) }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it('stores and echoes back a valid settings list', async () => {
    mockCreateSucceeds();
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Beinpresse', settings: ['seat_height', 'lever_arm'] });

    expect(res.status).toBe(201);
    expect(res.body.exercise.settings).toEqual(['seat_height', 'lever_arm']);
  });

  it('defaults to an empty list when omitted', async () => {
    mockCreateSucceeds();
    const res = await request(app).post('/api/exercises').send({ nameDe: 'Bankdrücken' });
    expect(res.body.exercise.settings).toEqual([]);
  });

  it.each([
    ['an unknown code', { settings: ['warp_speed'] }],
    ['a non-array', { settings: 'seat_height' }],
    ['a duplicate entry', { settings: ['seat_height', 'seat_height'] }],
    ['a non-string element', { settings: [42] }],
  ])('rejects %s with 400 rather than storing it', async (_label, body) => {
    const res = await request(app)
      .post('/api/exercises')
      .send({ nameDe: 'Bankdrücken', ...body });

    expect(res.status).toBe(400);
    const inserted = queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises/.test(sql));
    expect(inserted).toBe(false);
  });

  it('reads a row written before the column existed as an empty list', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, settings: null }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');
    expect(res.body.exercise.settings).toEqual([]);
  });
});

describe('serialized exercise', () => {
  it('exposes archived state so clients can mark it in history', async () => {
    onQuery(/UPDATE exercises SET archived_at = NULL/, () => ({
      rows: [{ ...exercise, archived_at: 1730000000000 }],
    }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));

    const res = await request(app).post('/api/exercises/ex-1/unarchive');

    expect(res.body.exercise.archived).toBe(true);
    expect(res.body.exercise.archivedAt).toBe(1730000000000);
  });
});

describe('POST /api/exercises/:id/media — content-type allow-list', () => {
  beforeEach(() => {
    vi.mocked(processImage).mockClear();
    vi.mocked(processVideo).mockClear();
  });

  function mockUploadSucceeds() {
    onQuery(/^SELECT \* FROM exercises WHERE id = \$1/, () => ({ rows: [exercise] }));
    onQuery(/^SELECT MAX\(position\)/, () => ({ rows: [{ p: -1 }] }));
    onQuery(/^INSERT INTO media/, () => ({ rows: [] }));
    onQuery(/^UPDATE exercises SET updated_at/, () => ({ rows: [] }));
    onQuery(/SELECT \* FROM media WHERE exercise_id = \$1/, () => ({ rows: [] }));
  }

  it.each([
    ['image/jpeg', processImage],
    ['video/mp4', processVideo],
    ['video/webm', processVideo],
    ['video/quicktime', processVideo],
  ])('accepts %s and routes it through the matching processor', async (mimetype, processor) => {
    mockUploadSucceeds();
    vi.mocked(processor).mockResolvedValueOnce({
      mediaType: mimetype.startsWith('image/') ? 'image' : 'video',
      storage: 'local',
      objectKey: 'x',
      thumbKey: null,
      originalName: 'f',
    });

    const res = await request(app)
      .post('/api/exercises/ex-1/media')
      .attach('file', Buffer.from('bytes'), { filename: 'f', contentType: mimetype });

    expect(res.status).toBe(201);
    expect(processor).toHaveBeenCalled();
  });

  it.each([
    ['video/x-msvideo', 'an unlisted video container (avi)'],
    ['video/x-flv', 'an unlisted legacy video container (flv)'],
    ['application/octet-stream', 'a generic binary mimetype'],
  ])('rejects %s (%s) rather than storing it verbatim', async (mimetype) => {
    mockUploadSucceeds();

    const res = await request(app)
      .post('/api/exercises/ex-1/media')
      .attach('file', Buffer.from('bytes'), { filename: 'f', contentType: mimetype });

    expect(res.status).toBe(400);
    expect(processImage).not.toHaveBeenCalled();
    expect(processVideo).not.toHaveBeenCalled();
  });
});
