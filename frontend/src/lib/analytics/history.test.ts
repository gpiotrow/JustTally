import { describe, it, expect } from 'vitest';
import { exerciseHistory } from './history';
import type { WorkoutSession } from '../types';

const session = (
  id: string,
  date: number,
  entries: WorkoutSession['entries']
): WorkoutSession => ({ id, date, updatedAt: date, entries });

describe('exerciseHistory', () => {
  it('returns one point per session that logs the exercise, oldest first', () => {
    const sessions: WorkoutSession[] = [
      session('s2', 2000, [
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 5, weight: 90, type: 'working', done: true }] },
      ]),
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 5, weight: 80, type: 'working', done: true }] },
      ]),
    ];
    const points = exerciseHistory(sessions, 'ex-1');
    expect(points.map((p) => p.date)).toEqual([1000, 2000]);
  });

  it('skips sessions that never logged the exercise', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [{ exerciseId: 'ex-2', exerciseName: 'Row', sets: [] }]),
    ];
    expect(exerciseHistory(sessions, 'ex-1')).toEqual([]);
  });

  it('computes volume excluding warm-ups and the best e1RM for the session', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        {
          exerciseId: 'ex-1',
          exerciseName: 'Bench',
          sets: [
            { reps: 10, weight: 40, type: 'warmup', done: true },
            { reps: 5, weight: 90, type: 'working', done: true },
          ],
        },
      ]),
    ];
    const [point] = exerciseHistory(sessions, 'ex-1');
    expect(point.volume).toBe(450); // warmup excluded
    expect(point.e1rm).toBeCloseTo(105, 5);
    expect(point.e1rmReliable).toBe(true);
  });

  it('merges multiple entries of the same exercise within one session', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 5, weight: 80, type: 'working', done: true }] },
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 5, weight: 90, type: 'working', done: true }] },
      ]),
    ];
    const [point] = exerciseHistory(sessions, 'ex-1');
    expect(point.volume).toBe(400 + 450);
    expect(point.e1rm).toBeCloseTo(105, 5); // the higher of the two entries wins
  });

  it('reports e1rm null (not 0) for a session where only warm-ups were logged', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 10, weight: 40, type: 'warmup', done: true }] },
      ]),
    ];
    const [point] = exerciseHistory(sessions, 'ex-1');
    expect(point.e1rm).toBeNull();
    expect(point.volume).toBe(0);
  });

  it('flags an unreliable e1RM from a high-rep best set', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Bench', sets: [{ reps: 20, weight: 40, type: 'working', done: true }] },
      ]),
    ];
    expect(exerciseHistory(sessions, 'ex-1')[0].e1rmReliable).toBe(false);
  });
});
