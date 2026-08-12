import { describe, it, expect } from 'vitest';
import { duplicateWeekWithBump } from './periodization';
import type { RoutineWeek } from './types';

const week: RoutineWeek = {
  id: 'w1',
  name: 'Week 1',
  days: [
    {
      id: 'd1',
      name: 'Push A',
      exercises: [
        {
          exerciseId: 'ex1',
          exerciseName: 'Bench Press',
          alternatives: [],
          targetSets: 3,
          targetWeight: 60,
        },
        {
          exerciseId: 'ex2',
          exerciseName: 'Lateral Raise',
          alternatives: [],
          targetSets: 3,
          // No target weight — bodyweight-adjacent or not tracked numerically.
        },
      ],
    },
  ],
};

describe('duplicateWeekWithBump', () => {
  it('bumps every target weight by the given percentage', () => {
    const result = duplicateWeekWithBump(week, 2.5);
    expect(result.days[0].exercises[0].targetWeight).toBe(61.5);
  });

  it('leaves exercises without a target weight untouched', () => {
    const result = duplicateWeekWithBump(week, 2.5);
    expect(result.days[0].exercises[1].targetWeight).toBeUndefined();
  });

  it('rounds to two decimals rather than leaving float noise', () => {
    const result = duplicateWeekWithBump(week, 1.3333);
    expect(result.days[0].exercises[0].targetWeight).toBe(60.8);
  });

  it('supports a negative percentage as a deload', () => {
    const result = duplicateWeekWithBump(week, -10);
    expect(result.days[0].exercises[0].targetWeight).toBe(54);
  });

  it('assigns fresh ids to the week and every day', () => {
    const result = duplicateWeekWithBump(week, 0);
    expect(result.id).not.toBe(week.id);
    expect(result.days[0].id).not.toBe(week.days[0].id);
  });

  it('does not mutate the original week', () => {
    const original = JSON.parse(JSON.stringify(week));
    duplicateWeekWithBump(week, 50);
    expect(week).toEqual(original);
  });

  it('carries the week name and exercise identity through unchanged', () => {
    const result = duplicateWeekWithBump(week, 5);
    expect(result.name).toBe('Week 1');
    expect(result.days[0].name).toBe('Push A');
    expect(result.days[0].exercises[0].exerciseId).toBe('ex1');
  });
});
