import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the goals cell — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(goals) {
  const values = {
    goals,
    name_de: 'Bankdrücken',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — goals column', () => {
  it('parses a comma-separated list inside one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('strength,muscle_gain')]));
    expect(errors).toEqual([]);
    expect(rows[0].goals).toEqual(['strength', 'muscle_gain']);
  });

  it('reads an empty cell as an explicit empty list', () => {
    const { rows } = parseExercisesCsv(csv([row('')]));
    expect(rows[0].goals).toEqual([]);
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Strength , MUSCLE_GAIN ')]));
    expect(errors).toEqual([]);
    expect(rows[0].goals).toEqual(['strength', 'muscle_gain']);
  });

  it('rejects an unknown code rather than dropping it', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('strength,endurance')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('endurance');
  });

  it('rejects duplicates within one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('strength,strength')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Duplicate');
  });

  it('leaves goals undefined when the column is absent entirely', () => {
    // A CSV exported before the taxonomy existed. Undefined means "do not
    // touch what is stored" — importing an old file must not wipe curated
    // goal data.
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => c !== 'goals');
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Bankdrücken' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].goals).toBeUndefined();
  });
});

describe('exercisesToCsv — goals column', () => {
  it('joins a stored jsonb array into one comma-separated cell', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', name_de: 'Bankdrücken', goals: ['strength', 'muscle_gain'] },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine).toContain('"strength,muscle_gain"');
  });

  it('writes an empty cell for a row with no goals maintained', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'other', difficulty: 'beginner', name_de: 'X', goals: null },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine.split(';')[CSV_EXPORT_COLUMNS.indexOf('goals')]).toBe('""');
  });

  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', name_de: 'Bankdrücken', goals: ['strength', 'muscle_gain'] },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].goals).toEqual(['strength', 'muscle_gain']);
  });
});
