import { describe, it, expect } from 'vitest';
import { computeRecovery, decayFactor, type ExerciseMuscles } from './recovery';
import { RECOVERY_WINDOW_HOURS } from './muscles';
import type { WorkoutSession } from './types';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

const session = (
  id: string,
  date: number,
  exerciseId: string,
  sets: WorkoutSession['entries'][number]['sets'],
  tracking?: WorkoutSession['entries'][number]['tracking']
): WorkoutSession => ({
  id,
  date,
  startedAt: date,
  updatedAt: date,
  entries: [{ exerciseId, exerciseName: 'Test', tracking, sets }],
});

const workingSet = (reps: number, weight: number) =>
  ({ reps, weight, type: 'working', done: true }) as const;

describe('decayFactor', () => {
  it('is 1 at the moment of training', () => {
    expect(decayFactor(0, 48)).toBe(1);
  });

  it('is 0 exactly at the end of the window', () => {
    expect(decayFactor(48 * HOUR, 48)).toBe(0);
  });

  it('is 0 beyond the window, never a lingering sliver', () => {
    expect(decayFactor(1000 * HOUR, 48)).toBe(0);
  });

  it('falls linearly across the window', () => {
    expect(decayFactor(24 * HOUR, 48)).toBeCloseTo(0.5, 10);
    expect(decayFactor(12 * HOUR, 48)).toBeCloseTo(0.75, 10);
  });

  it('treats a future-dated session as just now rather than going above 1', () => {
    expect(decayFactor(-5 * HOUR, 48)).toBe(1);
  });

  it('respects the per-muscle window length', () => {
    // 48h of age: half-decayed for a 96h window, fully gone for a 48h one.
    expect(decayFactor(48 * HOUR, 96)).toBeCloseTo(0.5, 10);
    expect(decayFactor(48 * HOUR, 48)).toBe(0);
  });
});

describe('computeRecovery', () => {
  const benchMuscles: ExerciseMuscles = {
    musclesPrimary: ['chest'],
    musclesSecondary: ['triceps'],
  };
  const muscles = new Map([['ex-bench', benchMuscles]]);

  it('returns an all-zero map when nothing was ever logged', () => {
    const map = computeRecovery([], muscles, NOW);
    expect(map.chest).toEqual({ value: 0, weightedVolume: 0, lastTrainedAt: null });
  });

  it('returns an all-zero map when the catalog has no muscle data', () => {
    const sessions = [session('s1', NOW - HOUR, 'ex-bench', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, new Map(), NOW);
    expect(map.chest.value).toBe(0);
    expect(map.chest.lastTrainedAt).toBeNull();
  });

  it('charges a primary muscle full volume and a secondary muscle half', () => {
    const sessions = [session('s1', NOW, 'ex-bench', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, muscles, NOW);
    // 500kg volume, no decay at age 0: chest 500, triceps 250.
    expect(map.chest.weightedVolume).toBeCloseTo(500, 6);
    expect(map.triceps.weightedVolume).toBeCloseTo(250, 6);
  });

  it('normalises the busiest group to 1', () => {
    const sessions = [session('s1', NOW, 'ex-bench', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, muscles, NOW);
    expect(map.chest.value).toBe(1);
    expect(map.triceps.value).toBeCloseTo(0.5, 6);
    expect(map.quads.value).toBe(0);
  });

  it('excludes warm-up sets and sets that were not done', () => {
    const sessions = [
      session('s1', NOW, 'ex-bench', [
        { reps: 10, weight: 40, type: 'warmup', done: true },
        { reps: 5, weight: 100, type: 'working', done: false },
      ]),
    ];
    const map = computeRecovery(sessions, muscles, NOW);
    expect(map.chest.weightedVolume).toBe(0);
  });

  it('decays older sessions, so a fresh light session can outrank a stale heavy one', () => {
    const sessions = [
      // Heavy but 2/3 through the 72h chest window -> factor 1/3.
      session('s1', NOW - 48 * HOUR, 'ex-bench', [workingSet(10, 100)]),
      // Light but just now.
      session('s2', NOW, 'ex-bench', [workingSet(5, 100)]),
    ];
    const map = computeRecovery(sessions, muscles, NOW);
    // 1000 * (1/3) + 500 * 1 = 833.33
    expect(map.chest.weightedVolume).toBeCloseTo(1000 / 3 + 500, 4);
  });

  it('drops volume entirely once past the muscle window', () => {
    const sessions = [session('s1', NOW - 100 * HOUR, 'ex-bench', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, muscles, NOW);
    expect(map.chest.weightedVolume).toBe(0);
    expect(map.chest.value).toBe(0);
  });

  it('still reports lastTrainedAt for a session outside the recovery window', () => {
    // The load has decayed to nothing, but "when did I last train chest" is
    // exactly the question someone asks about a fully recovered muscle.
    const date = NOW - 100 * HOUR;
    const sessions = [session('s1', date, 'ex-bench', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, muscles, NOW);
    expect(map.chest.lastTrainedAt).toBe(date);
  });

  it('keeps the most recent date when a muscle was trained several times', () => {
    const older = NOW - 50 * HOUR;
    const newer = NOW - 2 * HOUR;
    const sessions = [
      session('s1', older, 'ex-bench', [workingSet(5, 100)]),
      session('s2', newer, 'ex-bench', [workingSet(5, 100)]),
    ];
    expect(computeRecovery(sessions, muscles, NOW).chest.lastTrainedAt).toBe(newer);
  });

  it('ignores an unknown muscle code instead of crashing', () => {
    const odd = new Map([['ex-x', { musclesPrimary: ['not_a_muscle'] }]]);
    const sessions = [session('s1', NOW, 'ex-x', [workingSet(5, 100)])];
    expect(() => computeRecovery(sessions, odd, NOW)).not.toThrow();
  });

  it('applies each muscle its own window rather than one global one', () => {
    // biceps window is shorter than chest's, so at the same age the shorter
    // window has decayed further.
    expect(RECOVERY_WINDOW_HOURS.chest).toBeGreaterThan(RECOVERY_WINDOW_HOURS.biceps);
    const curlMuscles = new Map([
      ['ex-both', { musclesPrimary: ['chest', 'biceps'] }],
    ]);
    const sessions = [session('s1', NOW - 40 * HOUR, 'ex-both', [workingSet(5, 100)])];
    const map = computeRecovery(sessions, curlMuscles, NOW);
    expect(map.chest.weightedVolume).toBeGreaterThan(map.biceps.weightedVolume);
  });

  it('charges a plank (time mode, no weight) by set count instead of vanishing at zero', () => {
    const abMuscles = new Map([['ex-plank', { musclesPrimary: ['abs'] }]]);
    const sessions = [
      session(
        's1',
        NOW,
        'ex-plank',
        [
          { reps: 0, durationSec: 60, type: 'working', done: true },
          { reps: 0, durationSec: 45, type: 'working', done: true },
        ],
        'time'
      ),
    ];
    const map = computeRecovery(sessions, abMuscles, NOW);
    // Two qualifying sets stand in for a kg-based volume that does not exist
    // for this mode — the muscle must not read as untrained.
    expect(map.abs.weightedVolume).toBe(2);
    expect(map.abs.value).toBe(1); // the only muscle charged, so it is the peak
  });

  it('still excludes a warm-up set from the time-mode set-count stimulus', () => {
    const abMuscles = new Map([['ex-plank', { musclesPrimary: ['abs'] }]]);
    const sessions = [
      session(
        's1',
        NOW,
        'ex-plank',
        [
          { reps: 0, durationSec: 20, type: 'warmup', done: true },
          { reps: 0, durationSec: 60, type: 'working', done: true },
        ],
        'time'
      ),
    ];
    const map = computeRecovery(sessions, abMuscles, NOW);
    expect(map.abs.weightedVolume).toBe(1);
  });
});
