import { describe, it, expect } from 'vitest';
import { lastSettingsFor } from './lastSettings';
import type { WorkoutSession } from '../types';

const session = (
  id: string,
  date: number,
  entries: WorkoutSession['entries'],
  startedAt?: number
): WorkoutSession => ({ id, date, startedAt, updatedAt: date, entries });

describe('lastSettingsFor', () => {
  it('returns undefined for an exercise never logged', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [{ exerciseId: 'ex-2', exerciseName: 'Row', sets: [] }]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toBeUndefined();
  });

  it('returns the settings from the most recent session', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
      ]),
      session('s2', 2000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '4' }, sets: [] },
      ]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toEqual({ seat_height: '4' });
  });

  it('is not confused by session order in the array — newest wins on date, not position', () => {
    const sessions: WorkoutSession[] = [
      session('s2', 2000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '4' }, sets: [] },
      ]),
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
      ]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toEqual({ seat_height: '4' });
  });

  it('prefers startedAt over the save timestamp when both are present', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 2000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
      ], 500),
      session('s2', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '4' }, sets: [] },
      ], 1500),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toEqual({ seat_height: '4' });
  });

  it('returns undefined when the most recent entry logged no settings, even if an older one did', () => {
    // "Last time" means the most recent entry's own settings, not the most
    // recent non-empty one — an empty result here is a correct answer, not a
    // gap to paper over with stale data.
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
      ]),
      session('s2', 2000, [{ exerciseId: 'ex-1', exerciseName: 'Leg Press', sets: [] }]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toBeUndefined();
  });

  it('keeps the first entry within the same session rather than a later duplicate', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '9' }, sets: [] },
      ]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1')).toEqual({ seat_height: '2' });
  });

  it('excludes the session passed as excludeSessionId', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '2' }, sets: [] },
      ]),
      session('s2', 2000, [
        { exerciseId: 'ex-1', exerciseName: 'Leg Press', settings: { seat_height: '4' }, sets: [] },
      ]),
    ];
    expect(lastSettingsFor(sessions, 'ex-1', { excludeSessionId: 's2' })).toEqual({ seat_height: '2' });
  });
});
