import { describe, it, expect } from 'vitest';
import { parseExercisesCsv } from './csvImport.js';
import { exercisesToCsv, CSV_EXPORT_COLUMNS } from './csvExport.js';

const HEADER = CSV_EXPORT_COLUMNS.join(';');

/** Build a CSV buffer from data rows, using the current full column set. */
function csv(rows) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

/**
 * A row with only a German name filled in, plus the settings cell — built
 * from the column list rather than by counting semicolons, so it stays
 * correct when a column is added.
 */
function row(settings) {
  const values = {
    settings,
    name_de: 'Beinpresse',
  };
  return CSV_EXPORT_COLUMNS.map((c) => values[c] ?? '').join(';');
}

describe('parseExercisesCsv — settings column', () => {
  it('parses a comma-separated list inside one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('seat_height,back_pad')]));
    expect(errors).toEqual([]);
    expect(rows[0].settings).toEqual(['seat_height', 'back_pad']);
  });

  it('reads an empty cell as an explicit empty list', () => {
    const { rows } = parseExercisesCsv(csv([row('')]));
    expect(rows[0].settings).toEqual([]);
  });

  it('lowercases and trims sloppy input', () => {
    const { rows, errors } = parseExercisesCsv(csv([row(' Seat_Height , BACK_PAD ')]));
    expect(errors).toEqual([]);
    expect(rows[0].settings).toEqual(['seat_height', 'back_pad']);
  });

  it('rejects an unknown code rather than dropping it', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('seat_height,warp_speed')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('warp_speed');
  });

  it('rejects duplicates within one cell', () => {
    const { rows, errors } = parseExercisesCsv(csv([row('seat_height,seat_height')]));
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Duplicate');
  });

  it('leaves settings undefined when the column is absent entirely', () => {
    // A CSV exported before the taxonomy existed. Undefined means "do not
    // touch what is stored" — importing an old file must not wipe curated
    // machine-setting data.
    const oldColumns = CSV_EXPORT_COLUMNS.filter((c) => c !== 'settings');
    const oldRow = oldColumns.map((c) => (c === 'name_de' ? 'Beinpresse' : '')).join(';');
    const buffer = Buffer.from([oldColumns.join(';'), oldRow].join('\n'), 'utf8');
    const { rows, errors } = parseExercisesCsv(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].settings).toBeUndefined();
  });
});

describe('exercisesToCsv — settings column', () => {
  it('joins a stored jsonb array into one comma-separated cell', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'legs', difficulty: 'beginner', name_de: 'Beinpresse', settings: ['seat_height', 'back_pad'] },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine).toContain('"seat_height,back_pad"');
  });

  it('writes an empty cell for a row with no settings maintained', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'other', difficulty: 'beginner', name_de: 'X', settings: null },
    ]);
    const [, dataLine] = out.trim().split('\n');
    expect(dataLine.split(';')[CSV_EXPORT_COLUMNS.indexOf('settings')]).toBe('""');
  });

  it('round-trips through export and back into the parser', () => {
    const out = exercisesToCsv([
      { ref: 1, category: 'legs', difficulty: 'beginner', name_de: 'Beinpresse', settings: ['seat_height', 'back_pad'] },
    ]);
    const { rows, errors } = parseExercisesCsv(Buffer.from(out, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].settings).toEqual(['seat_height', 'back_pad']);
  });
});
