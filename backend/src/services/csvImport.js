import { parse } from 'csv-parse/sync';

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
const MAX_ROWS = 1000;

/** German-preferred resolution of a bilingual field, with fallback to the other. */
function resolve(de, en) {
  return (de || '').trim() || (en || '').trim();
}

/**
 * Parse and validate a CSV buffer of exercises.
 *
 * Uses `;` as the column delimiter (Excel default in German locales).
 * Expected header columns:
 *   name_de, name_en, instructions_de, instructions_en, tips_de, tips_en, category, difficulty, ref
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
    if (!resolve(nameDe, nameEn)) {
      errors.push({ row: rowNumber, message: 'Missing name (name_de or name_en required)' });
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
      instructionsDe: (rec.instructions_de || '').trim(),
      instructionsEn: (rec.instructions_en || '').trim(),
      tipsDe: (rec.tips_de || '').trim(),
      tipsEn: (rec.tips_en || '').trim(),
      category: (rec.category || '').trim() || 'other',
      difficulty,
      ref,
    });
  });

  return { rows, errors };
}
