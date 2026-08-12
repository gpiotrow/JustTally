import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the two muscle cells — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(primary, secondary) {
  const values = {
    muscles_primary: primary,
    muscles_secondary: secondary,
    name_de: 'Bankdrücken',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — muscle columns', () => {
  it('parses a comma-separated list inside one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('chest,front_delts', 'triceps')]));
    expect(errors).toEqual([]);
    expect(rows[0].musclesPrimary).toEqual(['chest', 'front_delts']);
    expect(rows[0].musclesSecondary).toEqual(['triceps']);
  });

  it('reads an empty cell as an explicit empty list', () => {
    const { rows } = parseExercisesCsv(csv([row('', '')]));
    expect(rows[0].musclesPrimary).toEqual([]);
    expect(rows[0].musclesSecondary).toEqual([]);
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Chest , LATS ', '')]));
    expect(errors).toEqual([]);
    expect(rows[0].musclesPrimary).toEqual(['chest', 'lats']);
  });

  it('rejects an unknown code rather than dropping it', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('chest,pecs', '')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('pecs');
  });

  it('rejects duplicates within one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('chest,chest', '')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Duplicate');
  });

  it('leaves both lists undefined when the columns are absent entirely', () => {
    // A CSV exported before the taxonomy existed. Undefined means "do not
    // touch what is stored" — importing an old file must not wipe curated
    // muscle data.
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => !c.startsWith('muscles_'));
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Bankdrücken' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].musclesPrimary).toBeUndefined();
    expect(rows[0].musclesSecondary).toBeUndefined();
  });
});

describe('exercisesToCsv — muscle columns', () => {
  it('joins a stored jsonb array into one comma-separated cell', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', muscles_primary: ['chest'], muscles_secondary: ['triceps', 'front_delts'], name_de: 'Bankdrücken' },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine).toContain('"chest"');
    expect(dataLine).toContain('"triceps,front_delts"');
  });

  it('writes an empty cell for a row with no muscles maintained', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'other', difficulty: 'beginner', muscles_primary: [], muscles_secondary: null, name_de: 'X' },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine.split(';')[3]).toBe('""');
    expect(dataLine.split(';')[4]).toBe('""');
  });

  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', muscles_primary: ['chest', 'front_delts'], muscles_secondary: ['triceps'], name_de: 'Bankdrücken' },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].musclesPrimary).toEqual(['chest', 'front_delts']);
    expect(rows[0].musclesSecondary).toEqual(['triceps']);
  });
});
