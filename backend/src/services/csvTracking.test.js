import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the tracking cell — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(tracking) {
  const values = {
    tracking,
    name_de: 'Unterarmstütz',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — tracking column', () => {
  it('parses a known tracking mode', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('time')]));
    expect(errors).toEqual([]);
    expect(rows[0].tracking).toBe('time');
  });

  it('defaults an empty cell to "reps_weight"', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('')]));
    expect(errors).toEqual([]);
    expect(rows[0].tracking).toBe('reps_weight');
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Time ')]));
    expect(errors).toEqual([]);
    expect(rows[0].tracking).toBe('time');
  });

  it('rejects an unknown code rather than storing it as free text', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('duration')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('duration');
  });

  it('defaults to "reps_weight" when the column is absent entirely', () => {
    // Same rule as category: a missing column is treated the same as an
    // empty cell, not as "leave whatever is stored alone" — tracking is a
    // required scalar like category, not an optional list like equipment.
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => c !== 'tracking');
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Unterarmstütz' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].tracking).toBe('reps_weight');
  });
});

describe('exercisesToCsv — tracking column', () => {
  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'core', difficulty: 'beginner', name_de: 'Unterarmstütz', tracking: 'time' },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].tracking).toBe('time');
  });

  it('writes "reps_weight" for a row with no tracking mode stored', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'other', difficulty: 'beginner', name_de: 'X', tracking: null },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine.split(';')[CSV_EXPORT_COLUMNS.indexOf('tracking')]).toBe('"reps_weight"');
  });
});
