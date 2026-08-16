import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the equipment cell — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(equipment) {
  const values = {
    equipment,
    name_de: 'Bankdrücken',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — equipment column', () => {
  it('parses a comma-separated list inside one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('barbell,bench')]));
    expect(errors).toEqual([]);
    expect(rows[0].equipment).toEqual(['barbell', 'bench']);
  });

  it('reads an empty cell as an explicit empty list', () => {
    const { rows } = parseExercisesCsv(csv([row('')]));
    expect(rows[0].equipment).toEqual([]);
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Barbell , BENCH ')]));
    expect(errors).toEqual([]);
    expect(rows[0].equipment).toEqual(['barbell', 'bench']);
  });

  it('rejects an unknown code rather than dropping it', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('barbell,treadmill')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('treadmill');
  });

  it('rejects duplicates within one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('barbell,barbell')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Duplicate');
  });

  it('leaves equipment undefined when the column is absent entirely', () => {
    // A CSV exported before the taxonomy existed. Undefined means "do not
    // touch what is stored" — importing an old file must not wipe curated
    // equipment data.
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => c !== 'equipment');
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Bankdrücken' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].equipment).toBeUndefined();
  });
});

describe('exercisesToCsv — equipment column', () => {
  it('joins a stored jsonb array into one comma-separated cell', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', name_de: 'Bankdrücken', equipment: ['barbell', 'bench'] },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine).toContain('"barbell,bench"');
  });

  it('writes an empty cell for a row with no equipment maintained', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'other', difficulty: 'beginner', name_de: 'X', equipment: null },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine.split(';')[CSV_EXPORT_COLUMNS.indexOf('equipment')]).toBe('""');
  });

  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'chest', difficulty: 'beginner', name_de: 'Bankdrücken', equipment: ['barbell', 'bench'] },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].equipment).toEqual(['barbell', 'bench']);
  });
});
