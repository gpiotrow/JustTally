import { describe, it, expect } from 'vitest';
import { sessionsToCsv } from './exportCsv';
import type { WorkoutSession } from './types';

const session: WorkoutSession = {
  id: 's1',
  date: Date.UTC(2026, 0, 15),
  title: 'Push A',
  updatedAt: Date.UTC(2026, 0, 15),
  entries: [
    {
      exerciseId: 'e1',
      exerciseName: 'Bench Press',
      sets: [
        { reps: 10, weight: 40, type: 'warmup', done: true },
        { reps: 8, weight: 80, type: 'working', done: true, rpe: 8 },
        { reps: 6, weight: 62.5, type: 'drop', done: false },
      ],
    },
  ],
};

describe('sessionsToCsv', () => {
  it('emits a header followed by one row per set', () => {
    const csv = sessionsToCsv([session]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4); // header + 3 sets
    expect(lines[0]).toBe(
      'date;session_title;exercise_name;set_number;type;reps;weight_kg;rpe;done;duration_sec;distance_m;tracking;settings'
    );
  });

  it('fills type, rpe and done-ness per set', () => {
    const csv = sessionsToCsv([session]);
    const lines = csv.trim().split('\n');
    expect(lines[1]).toBe(
      '"2026-01-15";"Push A";"Bench Press";"1";"warmup";"10";"40";"";"true";"";"";"reps_weight";""'
    );
    expect(lines[2]).toBe(
      '"2026-01-15";"Push A";"Bench Press";"2";"working";"8";"80";"8";"true";"";"";"reps_weight";""'
    );
    expect(lines[3]).toBe(
      '"2026-01-15";"Push A";"Bench Press";"3";"drop";"6";"62.5";"";"false";"";"";"reps_weight";""'
    );
  });

  it('emits duration, distance, tracking mode and settings when present', () => {
    const timedSession: WorkoutSession = {
      id: 's2',
      date: Date.UTC(2026, 0, 16),
      updatedAt: Date.UTC(2026, 0, 16),
      entries: [
        {
          exerciseId: 'e2',
          exerciseName: 'Plank',
          tracking: 'time',
          settings: { seat_height: '4', back_pad: '2' },
          sets: [{ reps: 0, durationSec: 60, done: true }],
        },
      ],
    };
    const lines = sessionsToCsv([timedSession]).trim().split('\n');
    expect(lines[1]).toBe(
      '"2026-01-16";"";"Plank";"1";"working";"0";"";"";"true";"60";"";"time";"seat_height=4|back_pad=2"'
    );
  });

  it('produces just a header for no sessions', () => {
    expect(sessionsToCsv([]).trim().split('\n')).toHaveLength(1);
  });
});
