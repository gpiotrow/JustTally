import { describe, it, expect } from 'vitest';
import { buildExport } from './exportWorkouts';
import { parseExport, ExportFormatError } from './importWorkouts';
import type { ExportBundle } from './exportSchema';
import type { Routine, WorkoutSession } from './types';

/** A routine exercising the parts of the model that are easy to lose: alternatives. */
const routine: Routine = {
  id: 'r1',
  name: 'Push A',
  description: 'Chest-focused push day',
  updatedAt: 1_700_000_000_000,
  weeks: [
    {
      id: 'w1',
      name: 'Week 1',
      days: [
        {
          id: 'd1',
          name: 'Day 1',
          exercises: [
            {
              exerciseId: 'ex-bench',
              exerciseRef: 1,
              exerciseName: 'Bench Press',
              alternatives: [
                { exerciseId: 'ex-db-press', exerciseRef: 2, exerciseName: 'Dumbbell Press' },
                { exerciseId: 'ex-machine-press', exerciseRef: 3, exerciseName: 'Machine Press' },
              ],
              targetSets: 4,
              targetReps: '8-12',
              targetWeight: 60,
              targetRpe: 8,
              restSeconds: 120,
              groupId: undefined,
              notes: 'Pause at the chest',
            },
          ],
        },
      ],
    },
  ],
};

/** A session exercising drop sets, a superset, and RPE together. */
const session: WorkoutSession = {
  id: 's1',
  date: 1_700_100_000_000,
  title: 'Push A',
  startedAt: 1_700_099_000_000,
  durationMin: 74,
  notes: 'Felt strong',
  updatedAt: 1_700_100_500_000,
  routineId: 'r1',
  weekIndex: 0,
  dayId: 'd1',
  entries: [
    {
      exerciseId: 'ex-bench',
      exerciseRef: 1,
      exerciseName: 'Bench Press',
      plannedExerciseId: 'ex-bench',
      sets: [
        { reps: 10, weight: 40, type: 'warmup', done: true },
        { reps: 8, weight: 80, type: 'working', done: true, rpe: 8, completedAt: 1_700_100_100_000 },
        { reps: 6, weight: 62.5, type: 'drop', done: true, completedAt: 1_700_100_120_000 },
      ],
    },
    {
      exerciseId: 'ex-row',
      exerciseRef: 4,
      exerciseName: 'Cable Row',
      groupId: 'sg1',
      sets: [{ reps: 12, weight: 50, type: 'working', done: true, rpe: 7.5 }],
    },
    {
      exerciseId: 'ex-lateral-raise',
      exerciseRef: 5,
      exerciseName: 'Lateral Raise',
      groupId: 'sg1',
      sets: [{ reps: 15, weight: 8, type: 'working', done: false }],
    },
  ],
};

const bundle: ExportBundle = {
  exercises: [
    { id: 'ex-bench', ref: 1, name: 'Bench Press' },
    { id: 'ex-db-press', ref: 2, name: 'Dumbbell Press' },
    { id: 'ex-machine-press', ref: 3, name: 'Machine Press' },
    { id: 'ex-row', ref: 4, name: 'Cable Row' },
    { id: 'ex-lateral-raise', ref: 5, name: 'Lateral Raise' },
  ],
  routines: [routine],
  bodyWeights: [{ date: 1_700_000_000_000, kg: 82.4 }],
  sessions: [session],
};

describe('round trip: import(export(x)) === x', () => {
  it('carries drop sets, supersets, RPE and alternatives through unchanged', () => {
    const file = buildExport(bundle, 'kg');
    // The file must itself be valid JSON — going through stringify/parse
    // catches anything that only survives as a live JS object (e.g. a Map,
    // or a key whose value is `undefined` versus simply absent).
    const roundTripped = JSON.parse(JSON.stringify(file));
    const { bundle: parsed, errors } = parseExport(roundTripped);

    expect(errors).toEqual([]);
    expect(parsed).toEqual(bundle);
  });
});

describe('parseExport', () => {
  it('rejects a file with no recognisable format tag', () => {
    expect(() => parseExport({ exercises: [] })).toThrow(ExportFormatError);
  });

  it('rejects a file with the wrong format tag', () => {
    expect(() => parseExport({ format: 'some-other-format/v1' })).toThrow(ExportFormatError);
  });

  it('rejects non-object input', () => {
    expect(() => parseExport('not an object')).toThrow(ExportFormatError);
    expect(() => parseExport(null)).toThrow(ExportFormatError);
  });

  it('drops malformed rows and reports them instead of failing the whole import', () => {
    const file = buildExport(bundle, 'kg');
    const withGarbage = {
      ...file,
      sessions: [...file.sessions, { id: 'broken', entries: 'not an array' }],
    };
    const { bundle: parsed, errors } = parseExport(withGarbage);
    expect(parsed.sessions).toEqual(bundle.sessions);
    expect(errors).toEqual(['sessions[1]: malformed, skipped']);
  });

  it('treats a missing collection as empty rather than failing', () => {
    const { bundle: parsed, errors } = parseExport({ format: 'justtally-export/v1' });
    expect(parsed).toEqual({ exercises: [], routines: [], bodyWeights: [], sessions: [] });
    expect(errors.length).toBe(4);
  });
});
