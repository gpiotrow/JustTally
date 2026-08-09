import { parse } from 'csv-parse/sync';
import { CSV_EXPORT_COLUMNS } from './csvExport.js';

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
const MAX_ROWS = 1000;

/** Preferred resolution across three languages: de -> en -> es. */
function resolve(de, en, es) {
  return (de || '').trim() || (en || '').trim() || (es || '').trim();
}

/**
 * Parse and validate a CSV buffer of exercises.
 *
 * Uses `;` as the column delimiter (Excel default in German locales).
 * Expected header columns (see {@link CSV_EXPORT_COLUMNS}):
 *   ref, category, difficulty, name_de, purpose_de, instructions_de,
 *   name_en, purpose_en, instructions_en, name_es, purpose_es, instructions_es
 * `ref` is optional; when omitted the exercise gets the next auto number.
 *
 * @param {Buffer} buffer Raw uploaded CSV file content.
 * @returns {{ rows: Array, errors: Array<{ row: number, message: string }> }}
 */
export function parseExercisesCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      columns: true,
      delimiter: ';',
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid CSV';
    throw new Error(`Could not parse CSV file: ${reason}`);
  }

  if (records.length > MAX_ROWS) {
    throw new Error(`Too many rows (${records.length}); maximum is ${MAX_ROWS}`);
  }

  const rows = [];
  const errors = [];

  records.forEach((rec, index) => {
    // Header is row 1; first data row is row 2.
    const rowNumber = index + 2;

    const nameDe = (rec.name_de || '').trim();
    const nameEn = (rec.name_en || '').trim();
    const nameEs = (rec.name_es || '').trim();
    if (!resolve(nameDe, nameEn, nameEs)) {
      errors.push({ row: rowNumber, message: 'Missing name (name_de, name_en or name_es required)' });
      return;
    }

    let difficulty = (rec.difficulty || '').trim().toLowerCase();
    if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
      errors.push({
        row: rowNumber,
        message: `Invalid difficulty "${difficulty}" (allowed: ${VALID_DIFFICULTY.join(', ')})`,
      });
      return;
    }
    if (!difficulty) difficulty = 'beginner';

    const refRaw = (rec.ref || '').trim();
    let ref = null;
    if (refRaw) {
      const n = Number(refRaw);
      if (!Number.isInteger(n) || n <= 0) {
        errors.push({ row: rowNumber, message: `Invalid ref "${refRaw}" (positive integer required)` });
        return;
      }
      ref = n;
    }

    rows.push({
      rowNumber,
      nameDe,
      nameEn,
      nameEs,
      purposeDe: (rec.purpose_de || '').trim(),
      purposeEn: (rec.purpose_en || '').trim(),
      purposeEs: (rec.purpose_es || '').trim(),
      instructionsDe: (rec.instructions_de || '').trim(),
      instructionsEn: (rec.instructions_en || '').trim(),
      instructionsEs: (rec.instructions_es || '').trim(),
      category: (rec.category || '').trim() || 'other',
      difficulty,
      ref,
    });
  });

  return { rows, errors };
}

// Re-exported so callers that only need the column list don't have to reach
// into csvExport.js directly.
export { CSV_EXPORT_COLUMNS };
