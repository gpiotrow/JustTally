import { describe, it, expect } from 'vitest';
import { routineDayFromSession, routineFromSession } from './sessionToRoutine';
import type { WorkoutEntry, WorkoutSession, WorkoutSet } from './types';

function set(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { reps: 10, weight: 50, type: 'working', done: true, ...overrides };
}

function entry(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return {
    exerciseId: 'ex-1',
    exerciseRef: 7,
    exerciseName: 'Bankdrücken',
    sets: [set()],
    ...overrides,
  };
}

function session(entries: WorkoutEntry[], overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's1',
    date: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    entries,
    ...overrides,
  };
}

describe('routineDayFromSession', () => {
  it('takes the day name from the session title', () => {
    const day = routineDayFromSession(session([entry()], { title: 'Push Day' }));
    expect(day.name).toBe('Push Day');
  });

  it('falls back to an empty name when the session has no title', () => {
    const day = routineDayFromSession(session([entry()]));
    expect(day.name).toBe('');
  });

  it('excludes warm-up sets from both the count and the targets', () => {
    const day = routineDayFromSession(
      session([
        entry({
          sets: [
            set({ type: 'warmup', reps: 15, weight: 20 }),
            set({ type: 'working', reps: 10, weight: 60 }),
            set({ type: 'working', reps: 10, weight: 60 }),
          ],
        }),
      ])
    );
    expect(day.exercises).toHaveLength(1);
    expect(day.exercises[0].targetSets).toBe(2);
    expect(day.exercises[0].targetWeight).toBe(60);
  });

  it('counts drop sets as work', () => {
    const day = routineDayFromSession(
      session([
        entry({
          sets: [set({ type: 'working' }), set({ type: 'drop', weight: 40 })],
        }),
      ])
    );
    expect(day.exercises[0].targetSets).toBe(2);
  });

  it('drops an entry with only warm-up sets entirely', () => {
    const day = routineDayFromSession(
      session([entry({ sets: [set({ type: 'warmup' })] })])
    );
    expect(day.exercises).toEqual([]);
  });

  it('drops an entry with no sets at all', () => {
    const day = routineDayFromSession(session([entry({ sets: [] })]));
    expect(day.exercises).toEqual([]);
  });

  it('carries the exercise identity and superset grouping through', () => {
    const day = routineDayFromSession(
      session([entry({ exerciseId: 'ex-9', exerciseRef: 3, exerciseName: 'Kniebeuge', groupId: 'g1' })])
    );
    expect(day.exercises[0]).toMatchObject({
      exerciseId: 'ex-9',
      exerciseRef: 3,
      exerciseName: 'Kniebeuge',
      groupId: 'g1',
      alternatives: [],
    });
  });

  it('leaves RPE and rest untouched — they start unset on the template', () => {
    const day = routineDayFromSession(
      session([entry({ sets: [set({ rpe: 8.5 })] })])
    );
    expect(day.exercises[0].targetRpe).toBeUndefined();
    expect(day.exercises[0].restSeconds).toBeUndefined();
  });

  describe('reps_weight (the default mode)', () => {
    it('uses a single number when every set had the same reps', () => {
      const day = routineDayFromSession(
        session([entry({ sets: [set({ reps: 10 }), set({ reps: 10 })] })])
      );
      expect(day.exercises[0].targetReps).toBe('10');
    });

    it('uses a min-max range when reps varied across sets', () => {
      const day = routineDayFromSession(
        session([entry({ sets: [set({ reps: 12 }), set({ reps: 8 }), set({ reps: 10 })] })])
      );
      expect(day.exercises[0].targetReps).toBe('8-12');
    });

    it('takes the weight from the heaviest working set', () => {
      const day = routineDayFromSession(
        session([entry({ sets: [set({ weight: 40 }), set({ weight: 60 }), set({ weight: 50 })] })])
      );
      expect(day.exercises[0].targetWeight).toBe(60);
    });

    it('leaves the weight unset when no working set recorded one', () => {
      const day = routineDayFromSession(
        session([entry({ sets: [set({ weight: undefined })] })])
      );
      expect(day.exercises[0].targetWeight).toBeUndefined();
    });
  });

  it('reads the frozen tracking mode on the entry, not the current catalog default', () => {
    const day = routineDayFromSession(
      session([
        entry({
          tracking: 'reps',
          sets: [set({ reps: 12, weight: 999 })],
        }),
      ])
    );
    // 'reps' mode never derives a target weight, even though the set has one.
    expect(day.exercises[0].targetReps).toBe('12');
    expect(day.exercises[0].targetWeight).toBeUndefined();
  });

  it('time mode: takes duration and weight from the longest working set', () => {
    const day = routineDayFromSession(
      session([
        entry({
          tracking: 'time_weight',
          sets: [
            set({ durationSec: 30, weight: 10 }),
            set({ durationSec: 45, weight: 12 }),
          ],
        }),
      ])
    );
    expect(day.exercises[0].targetDurationSec).toBe(45);
    expect(day.exercises[0].targetWeight).toBe(12);
    expect(day.exercises[0].targetReps).toBeUndefined();
  });

  it('plain time mode: duration only, no weight', () => {
    const day = routineDayFromSession(
      session([entry({ tracking: 'time', sets: [set({ durationSec: 20 }), set({ durationSec: 40 })] })])
    );
    expect(day.exercises[0].targetDurationSec).toBe(40);
    expect(day.exercises[0].targetWeight).toBeUndefined();
  });

  it('distance_time mode: takes distance and duration from the farthest working set', () => {
    const day = routineDayFromSession(
      session([
        entry({
          tracking: 'distance_time',
          sets: [
            set({ distanceM: 1000, durationSec: 300 }),
            set({ distanceM: 2000, durationSec: 620 }),
          ],
        }),
      ])
    );
    expect(day.exercises[0].targetDistanceM).toBe(2000);
    expect(day.exercises[0].targetDurationSec).toBe(620);
  });
});

describe('routineFromSession', () => {
  it('wraps the day into a fresh routine with the given name', () => {
    const routine = routineFromSession(session([entry()], { title: 'Push Day' }), 'Meine neue Routine');
    expect(routine.name).toBe('Meine neue Routine');
    expect(routine.weeks).toHaveLength(1);
    expect(routine.weeks[0].days).toHaveLength(1);
    expect(routine.weeks[0].days[0].name).toBe('Push Day');
    expect(routine.weeks[0].days[0].exercises[0].exerciseId).toBe('ex-1');
  });

  it('gives the routine, week, and day their own fresh ids', () => {
    const a = routineFromSession(session([entry()]), 'A');
    const b = routineFromSession(session([entry()]), 'B');
    expect(a.id).not.toBe(b.id);
    expect(a.weeks[0].id).not.toBe(b.weeks[0].id);
    expect(a.weeks[0].days[0].id).not.toBe(b.weeks[0].days[0].id);
  });
});
