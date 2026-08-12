import { describe, it, expect } from 'vitest';
import { exerciseRecency } from './exerciseRecency';
import type { WorkoutSession, WorkoutEntry } from './types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const entry = (exerciseId: string, reps = 8, weight = 80): WorkoutEntry => ({
  exerciseId,
  exerciseName: exerciseId,
  sets: [{ reps, weight, type: 'working', done: true }],
});

const session = (id: string, date: number, entries: WorkoutEntry[]): WorkoutSession => ({
  id,
  date,
  startedAt: date,
  updatedAt: date,
  entries,
});

describe('exerciseRecency', () => {
  it('is empty for no sessions', () => {
    expect(exerciseRecency([]).size).toBe(0);
  });

  it('records when an exercise was last used', () => {
    const map = exerciseRecency([session('s1', NOW - DAY, [entry('bench')])]);
    expect(map.get('bench')?.lastUsedAt).toBe(NOW - DAY);
  });

  it('keeps the newest timestamp regardless of the order sessions arrive in', () => {
    const older = session('s1', NOW - 5 * DAY, [entry('bench')]);
    const newer = session('s2', NOW - DAY, [entry('bench')]);
    expect(exerciseRecency([older, newer]).get('bench')?.lastUsedAt).toBe(NOW - DAY);
    expect(exerciseRecency([newer, older]).get('bench')?.lastUsedAt).toBe(NOW - DAY);
  });

  it('counts the sessions an exercise appears in', () => {
    const map = exerciseRecency([
      session('s1', NOW - 5 * DAY, [entry('bench'), entry('squat')]),
      session('s2', NOW - DAY, [entry('bench')]),
    ]);
    expect(map.get('bench')?.count).toBe(2);
    expect(map.get('squat')?.count).toBe(1);
  });

  it('counts a session once even when the exercise is logged twice in it', () => {
    const map = exerciseRecency([session('s1', NOW, [entry('bench'), entry('bench')])]);
    expect(map.get('bench')?.count).toBe(1);
  });

  it('carries the sets of the newest session, not of the one seen last', () => {
    const older = session('s1', NOW - 5 * DAY, [entry('bench', 5, 60)]);
    const newer = session('s2', NOW - DAY, [entry('bench', 8, 80)]);
    const map = exerciseRecency([newer, older]);
    expect(map.get('bench')?.lastSets).toEqual([{ reps: 8, weight: 80, type: 'working', done: true }]);
  });

  it('takes the first entry when the newest session logs the exercise twice', () => {
    const map = exerciseRecency([session('s1', NOW, [entry('bench', 5, 60), entry('bench', 8, 80)])]);
    expect(map.get('bench')?.lastSets[0].reps).toBe(5);
  });

  it('falls back to `date` when a session has no explicit start', () => {
    const s: WorkoutSession = { id: 's1', date: NOW - DAY, updatedAt: NOW, entries: [entry('bench')] };
    expect(exerciseRecency([s]).get('bench')?.lastUsedAt).toBe(NOW - DAY);
  });

  it('ignores the session being edited when asked to', () => {
    const sessions = [
      session('s1', NOW - 5 * DAY, [entry('bench')]),
      session('editing', NOW, [entry('bench'), entry('squat')]),
    ];
    const map = exerciseRecency(sessions, { excludeSessionId: 'editing' });
    expect(map.get('bench')?.lastUsedAt).toBe(NOW - 5 * DAY);
    expect(map.get('bench')?.count).toBe(1);
    expect(map.has('squat')).toBe(false);
  });

  it('leaves out exercises that were never logged', () => {
    const map = exerciseRecency([session('s1', NOW, [entry('bench')])]);
    expect(map.has('squat')).toBe(false);
  });
});
