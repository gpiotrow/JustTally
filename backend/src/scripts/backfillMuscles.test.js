import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({
  default: { query: (...args) => queryMock(...args), end: vi.fn() },
}));

const { backfill, CATEGORY_TO_PRIMARY } = await import('./backfillMuscles.js');

let logs;
beforeEach(() => {
  queryMock.mockReset();
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const exercise = (overrides = {}) => ({
  id: 'ex1',
  ref: 1,
  name: 'Bench Press',
  category: 'chest',
  muscles_primary: [],
  ...overrides,
});

/** Answer the initial SELECT with these rows; every later call is an UPDATE. */
function mockCatalog(rows) {
  queryMock.mockImplementation(async (sql) => {
    if (/SELECT id, ref, name, category/.test(sql)) return { rows };
    return { rows: [] };
  });
}

const updateCalls = () => queryMock.mock.calls.filter(([sql]) => /UPDATE exercises/.test(sql));

describe('backfill — dry run (default)', () => {
  it('writes nothing at all', async () => {
    mockCatalog([exercise()]);
    const result = await backfill();
    expect(updateCalls()).toEqual([]);
    expect(result.updated).toBe(1); // counted as "would update"
  });

  it('reports what it would set, as CSV on stdout', async () => {
    mockCatalog([exercise()]);
    await backfill();
    expect(logs[0]).toBe('exercise_ref,exercise_name,category,muscles_primary');
    expect(logs[1]).toBe('1,"Bench Press",chest,"chest"');
  });
});

describe('backfill — apply', () => {
  it('sets the mapped primary muscles for an unclassified exercise', async () => {
    mockCatalog([exercise()]);
    await backfill({ apply: true });
    const [[, params]] = updateCalls();
    expect(JSON.parse(params[0])).toEqual(['chest']);
    expect(params[2]).toBe('ex1');
  });

  it('never overwrites an exercise someone already classified', async () => {
    mockCatalog([exercise({ muscles_primary: ['lats'] })]);
    const result = await backfill({ apply: true });
    expect(updateCalls()).toEqual([]);
    expect(result.skippedClassified).toBe(1);
  });

  it('is safe to run twice: the second run finds nothing left to do', async () => {
    mockCatalog([exercise({ muscles_primary: ['chest'] })]);
    const result = await backfill({ apply: true });
    expect(result.updated).toBe(0);
  });

  it.each([['cardio'], ['other'], ['not_a_category']])(
    'leaves category %s alone rather than guessing',
    async (category) => {
      mockCatalog([exercise({ category })]);
      const result = await backfill({ apply: true });
      expect(updateCalls()).toEqual([]);
      expect(result.skippedNoMapping).toBe(1);
    }
  );

  it('expands a multi-muscle category into every mapped group', async () => {
    mockCatalog([exercise({ category: 'legs' })]);
    await backfill({ apply: true });
    const [[, params]] = updateCalls();
    expect(JSON.parse(params[0])).toEqual(['quads', 'hamstrings', 'glutes']);
  });

  it('never guesses a secondary muscle', async () => {
    mockCatalog([exercise()]);
    await backfill({ apply: true });
    const [[sql]] = updateCalls();
    expect(sql).not.toContain('muscles_secondary');
  });
});

describe('CATEGORY_TO_PRIMARY', () => {
  it('covers every category the app offers', async () => {
    // Kept in step with CATEGORIES in frontend/src/lib/types.ts by hand; this
    // asserts the list here at least has no gaps of its own.
    const categories = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other'];
    for (const c of categories) expect(CATEGORY_TO_PRIMARY[c]).toBeDefined();
  });
});
