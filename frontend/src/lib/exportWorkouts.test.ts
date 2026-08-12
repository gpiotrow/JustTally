import { describe, it, expect } from 'vitest';
import { buildExport } from './exportWorkouts';
import { EXPORT_FORMAT, type ExportBundle } from './exportSchema';

const emptyBundle: ExportBundle = { exercises: [], routines: [], bodyWeights: [], sessions: [] };

describe('buildExport', () => {
  it('tags the file with the format and the chosen display unit', () => {
    const file = buildExport(emptyBundle, 'lb');
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.displayUnit).toBe('lb');
  });

  it('stamps exportedAt with the current time', () => {
    const before = Date.now();
    const file = buildExport(emptyBundle, 'kg');
    expect(file.exportedAt).toBeGreaterThanOrEqual(before);
    expect(file.exportedAt).toBeLessThanOrEqual(Date.now());
  });

  it('carries every collection through unchanged', () => {
    const bundle: ExportBundle = {
      exercises: [{ id: 'e1', ref: 1, name: 'Bench Press' }],
      routines: [],
      bodyWeights: [{ date: 1, kg: 80 }],
      sessions: [],
    };
    const file = buildExport(bundle, 'kg');
    expect(file.exercises).toEqual(bundle.exercises);
    expect(file.bodyWeights).toEqual(bundle.bodyWeights);
  });
});
