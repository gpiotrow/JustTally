import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the category cell — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(category) {
  const values = {
    category,
    name_de: 'Bankdrücken',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — category column', () => {
  it('parses a known category code', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('legs')]));
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('legs');
  });

  it('defaults an empty cell to "other"', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('')]));
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('other');
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Chest ')]));
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('chest');
  });

  it('rejects an unknown code rather than storing it as free text', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('brust')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('brust');
  });

  it('defaults to "other" when the column is absent entirely', () => {
    // Unlike equipment/muscles/goals, category has always existed as a
    // required scalar column — a missing column is treated the same as an
    // empty cell, not as "leave whatever is stored alone".
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => c !== 'category');
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Bankdrücken' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('other');
  });
});

describe('exercisesToCsv — category column', () => {
  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'legs', difficulty: 'beginner', name_de: 'Kniebeuge' },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('legs');
  });
});
