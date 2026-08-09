import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const handlers = [];
const queryMock = vi.fn(async (sql, params) => {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const [pattern, respond] = handlers[i];
    if (pattern.test(sql)) return respond(sql, params);
  }
  return { rows: [], rowCount: 0 };
});
function onQuery(pattern, respond) {
  handlers.push([pattern, respond]);
}

const client = { query: (...args) => queryMock(...args), release: vi.fn() };

vi.mock('../db/database.js', () => ({
  default: { query: (...args) => queryMock(...args), connect: async () => client },
}));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'admin-1', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

const { default: exercisesRouter } = await import('./exercises.js');

const app = express();
app.use(express.json());
app.use('/api/exercises', exercisesRouter);

function csv(
  rows,
  header = 'ref;category;difficulty;name_de;purpose_de;instructions_de;name_en;purpose_en;instructions_en;name_es;purpose_es;instructions_es'
) {
  return [header, ...rows].join('\n');
}

function importRequest({ csvBody, mode, overwrite, dryRun } = {}) {
  let req = request(app).post('/api/exercises/import').attach('file', Buffer.from(csvBody), {
    filename: 'exercises.csv',
    contentType: 'text/csv',
  });
  if (mode !== undefined) req = req.field('mode', mode);
  if (overwrite !== undefined) req = req.field('overwrite', String(overwrite));
  if (dryRun !== undefined) req = req.field('dryRun', String(dryRun));
  return req;
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  onQuery(/BEGIN|COMMIT|ROLLBACK|SAVEPOINT/, () => ({ rows: [] }));
  onQuery(/nextval\('exercise_ref_seq'\)/, () => ({ rows: [{ ref: 999 }] }));
  onQuery(/setval\('exercise_ref_seq'/, () => ({ rows: [] }));
  onQuery(/SELECT id FROM exercises WHERE ref = \$1/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM media WHERE exercise_id = ANY/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM exercises WHERE id = ANY/, () => ({ rows: [] }));
});

describe('mode resolution', () => {
  it('defaults to merge: skips a name match without writing anything', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'existing-1', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null }],
    }));
    let wrote = false;
    onQuery(/SET ref = \$1, name = \$2/, () => {
      wrote = true;
      return { rows: [] };
    });

    const res = await importRequest({ csvBody: csv([';;;Bankdrücken;;;;;;;;']) });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mode: 'merge', imported: 0, updated: 0, skipped: 1 });
    expect(wrote).toBe(false);
  });

  it('legacy overwrite=true behaves as upsert', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'existing-1', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null }],
    }));
    let updated = false;
    onQuery(/SET ref = \$1, name = \$2/, () => {
      updated = true;
      return { rows: [] };
    });

    const res = await importRequest({ csvBody: csv([';;;Bankdrücken;;;;;;;;']), overwrite: true });

    expect(res.body).toMatchObject({ mode: 'upsert', updated: 1, skipped: 0 });
    expect(updated).toBe(true);
  });

  it('rejects a non-CSV file before parsing anything', async () => {
    const res = await request(app)
      .post('/api/exercises/import')
      .attach('file', Buffer.from('not a csv'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('dryRun — writes nothing', () => {
  it('reports counts without ever starting a transaction', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [
        { id: 'e1', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null },
        { id: 'e2', name_de: 'Kniebeuge', name_en: '', ref: 2, archived_at: null },
      ],
    }));

    const res = await importRequest({
      csvBody: csv([';;;Bankdrücken;;;;;;;;', ';;;Klimmzug;;;;;;;;']),
      mode: 'upsert',
      dryRun: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, mode: 'upsert', imported: 1, updated: 1, skipped: 0 });
    expect(queryMock.mock.calls.some(([sql]) => /^BEGIN$/.test(sql))).toBe(false);
    expect(queryMock.mock.calls.some(([sql]) => /INSERT INTO exercises|UPDATE exercises/.test(sql))).toBe(
      false
    );
  });

  it('mode=replace preview reports the archive warning with per-user counts', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [
        { id: 'kept', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null },
        { id: 'orphan-1', name_de: 'Alte Übung 1', name_en: '', ref: 10, archived_at: null },
        { id: 'orphan-2', name_de: 'Alte Übung 2', name_en: '', ref: 11, archived_at: null },
        { id: 'already-archived', name_de: 'Schon archiviert', name_en: '', ref: 12, archived_at: 555 },
      ],
    }));
    onQuery(/FROM unnest\(\$1::text\[\]\) AS x\(id\)/, (_sql, [ids]) => ({
      rows: ids.map((id) => ({
        exercise_id: id,
        workouts: id === 'orphan-1' ? 2 : 0,
        users: id === 'orphan-1' ? 1 : 0,
      })),
    }));
    onQuery(/COUNT\(DISTINCT w\.id\)::int/, () => ({ rows: [{ workouts: 2, users: 1 }] }));

    const res = await importRequest({ csvBody: csv([';;;Bankdrücken;;;;;;;;']), mode: 'replace', dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      mode: 'replace',
      imported: 0,
      updated: 1,
      // Only the two live, unmatched rows — the already-archived one is excluded.
      archived: 2,
      archivedInUse: 1,
      archivedAffectedUsers: 1,
    });
  });
});

describe('mode=replace — archives what the CSV no longer mentions', () => {
  it('archives unmatched existing exercises after a successful import', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [
        { id: 'kept', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null },
        { id: 'orphan', name_de: 'Verwaist', name_en: '', ref: 9, archived_at: null },
      ],
    }));
    onQuery(/SET ref = \$1, name = \$2/, () => ({ rows: [] }));
    let archiveParams = null;
    onQuery(/UPDATE exercises SET archived_at/, (_sql, params) => {
      archiveParams = params;
      return { rowCount: 1 };
    });
    onQuery(/FROM unnest\(\$1::text\[\]\) AS eid/, () => ({ rows: [{ workouts: 0, users: 0 }] }));

    const res = await importRequest({ csvBody: csv([';;;Bankdrücken;;;;;;;;']), mode: 'replace' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mode: 'replace', updated: 1, archived: 1 });
    expect(archiveParams[1]).toEqual(['orphan']);
  });

  it('never archives a row the CSV matched, even if its own update failed', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'matched-but-broken', name_de: 'Bankdrücken', name_en: '', ref: 1, archived_at: null }],
    }));
    onQuery(/SET ref = \$1, name = \$2/, () => {
      throw new Error('simulated update failure');
    });
    let archiveCalled = false;
    onQuery(/UPDATE exercises SET archived_at/, () => {
      archiveCalled = true;
      return { rowCount: 1 };
    });

    const res = await importRequest({ csvBody: csv([';;;Bankdrücken;;;;;;;;']), mode: 'replace' });

    expect(res.status).toBe(201);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(archiveCalled).toBe(false);
  });

  it('does not re-archive rows that are already archived', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'already-gone', name_de: 'Alt', name_en: '', ref: 5, archived_at: 123 }],
    }));
    let archiveCalled = false;
    onQuery(/UPDATE exercises SET archived_at/, () => {
      archiveCalled = true;
      return { rowCount: 1 };
    });

    const res = await importRequest({ csvBody: csv([';;;Neu;;;;;;;;']), mode: 'replace' });

    expect(res.body.archived).toBe(0);
    expect(archiveCalled).toBe(false);
  });

  it('merge and upsert modes never archive anything', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'untouched', name_de: 'Unerwähnt', name_en: '', ref: 3, archived_at: null }],
    }));
    let archiveCalled = false;
    onQuery(/UPDATE exercises SET archived_at/, () => {
      archiveCalled = true;
      return { rowCount: 1 };
    });

    await importRequest({ csvBody: csv([';;;Neu;;;;;;;;']), mode: 'upsert' });

    expect(archiveCalled).toBe(false);
  });

  it('un-archives a matched row instead of leaving it archived after update', async () => {
    onQuery(/SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises/, () => ({
      rows: [{ id: 'coming-back', name_de: 'Rückkehrer', name_en: '', ref: 7, archived_at: 999 }],
    }));
    let sql = null;
    onQuery(/SET ref = \$1, name = \$2/, (s) => {
      sql = s;
      return { rows: [] };
    });

    await importRequest({ csvBody: csv([';;;Rückkehrer;;;;;;;;']), mode: 'replace' });

    expect(sql).toMatch(/archived_at = NULL/);
  });
});

describe('GET /api/exercises/export.csv', () => {
  it('exports with ref filled, before the /:id route can intercept it', async () => {
    onQuery(/SELECT ref, category, difficulty,[\s\S]*?FROM exercises/, () => ({
      rows: [
        {
          ref: 1,
          category: 'chest',
          difficulty: 'intermediate',
          name_de: 'Bankdrücken',
          purpose_de: '',
          instructions_de: '',
          name_en: 'Bench Press',
          purpose_en: '',
          instructions_en: '',
          name_es: '',
          purpose_es: '',
          instructions_es: '',
        },
      ],
    }));

    const res = await request(app).get('/api/exercises/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('ref;category;difficulty');
    expect(res.text).toContain('"Bankdrücken"');
    expect(res.text).toContain('"1"');
  });
});

describe('PUT /api/exercises/:id/media/order', () => {
  it('rejects a payload that drops a media id', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [{ id: 'ex-1' }] }));
    onQuery(/SELECT id FROM media WHERE exercise_id = \$1/, () => ({
      rows: [{ id: 'm1' }, { id: 'm2' }],
    }));

    const res = await request(app)
      .put('/api/exercises/ex-1/media/order')
      .send({ mediaIds: ['m1'] });

    expect(res.status).toBe(400);
  });

  it('rejects a payload that adds an id not belonging to the exercise', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [{ id: 'ex-1' }] }));
    onQuery(/SELECT id FROM media WHERE exercise_id = \$1/, () => ({ rows: [{ id: 'm1' }] }));

    const res = await request(app)
      .put('/api/exercises/ex-1/media/order')
      .send({ mediaIds: ['m1', 'not-mine'] });

    expect(res.status).toBe(400);
  });

  it('persists position from array index for a valid reorder', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [{ id: 'ex-1' }] }));
    onQuery(/SELECT id FROM media WHERE exercise_id = \$1/, () => ({
      rows: [{ id: 'm1' }, { id: 'm2' }],
    }));
    onQuery(/SELECT \* FROM exercises WHERE id = \$1/, () => ({
      rows: [{ id: 'ex-1', name: 'X', archived_at: null }],
    }));
    const positions = [];
    onQuery(/UPDATE media SET position = \$1 WHERE id = \$2/, (_sql, params) => {
      positions.push(params);
      return { rows: [] };
    });

    const res = await request(app)
      .put('/api/exercises/ex-1/media/order')
      .send({ mediaIds: ['m2', 'm1'] });

    expect(res.status).toBe(200);
    expect(positions).toEqual([
      [0, 'm2'],
      [1, 'm1'],
    ]);
  });

  it('404s for an unknown exercise', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [] }));
    const res = await request(app).put('/api/exercises/ghost/media/order').send({ mediaIds: ['m1'] });
    expect(res.status).toBe(404);
  });
});
