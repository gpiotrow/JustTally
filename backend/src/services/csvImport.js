import { parse } from 'csv-parse/sync';
import { CSV_EXPORT_COLUMNS } from './csvExport.js';
import { MUSCLE_GROUPS, isMuscleGroup } from './muscles.js';
import { EQUIPMENT_ITEMS, isEquipmentItem } from './equipment.js';
import { GOAL_ITEMS, isGoalItem } from './goals.js';

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
const MAX_ROWS = 1000;

/**
 * Parse one muscle-list cell (`chest,triceps`) into codes.
 *
 * Returns `{ list }` or `{ error }` — an unknown code is refused rather than
 * dropped, because silently ignoring a typo would leave the exercise looking
 * maintained while contributing nothing to the heatmap.
 *
 * A **missing column** yields `{ list: undefined }`, which callers must treat
 * as "leave whatever is stored alone". Importing a CSV exported before this
 * column existed must not wipe muscle data someone has since maintained; an
 * empty cell in a file that *does* carry the column is a real instruction to
 * clear it.
 */
function parseMuscleCell(raw, columnName) {
  if (raw === undefined) return { list: undefined };

  const text = (raw || '').trim();
  if (!text) return { list: [] };

  const codes = text
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c !== '');

  const unknown = codes.filter((c) => !isMuscleGroup(c));
  if (unknown.length > 0) {
    return {
      error: `Invalid ${columnName} "${unknown.join(', ')}" (allowed: ${MUSCLE_GROUPS.join(', ')})`,
    };
  }
  if (new Set(codes).size !== codes.length) {
    return { error: `Duplicate entries in ${columnName}` };
  }
  return { list: codes };
}

/**
 * Parse the `equipment` cell (`barbell,bench`) into codes. Same shape as
 * `parseMuscleCell`, kept as its own function rather than a shared generic
 * so the well-tested muscle-parsing path stays untouched.
 *
 * Returns `{ list }` or `{ error }` — an unknown code is refused rather than
 * dropped. A **missing column** yields `{ list: undefined }` ("leave whatever
 * is stored alone"); an empty cell in a file that *does* carry the column is
 * a real instruction to clear it.
 */
function parseEquipmentCell(raw) {
  if (raw === undefined) return { list: undefined };

  const text = (raw || '').trim();
  if (!text) return { list: [] };

  const codes = text
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c !== '');

  const unknown = codes.filter((c) => !isEquipmentItem(c));
  if (unknown.length > 0) {
    return {
      error: `Invalid equipment "${unknown.join(', ')}" (allowed: ${EQUIPMENT_ITEMS.join(', ')})`,
    };
  }
  if (new Set(codes).size !== codes.length) {
    return { error: 'Duplicate entries in equipment' };
  }
  return { list: codes };
}

/**
 * Parse the `goals` cell (`strength,mobility`) into codes. Same shape as
 * `parseEquipmentCell`, kept as its own function for the same reason: the
 * well-tested muscle/equipment parsing paths stay untouched.
 *
 * Returns `{ list }` or `{ error }` — an unknown code is refused rather than
 * dropped. A **missing column** yields `{ list: undefined }` ("leave whatever
 * is stored alone"); an empty cell in a file that *does* carry the column is
 * a real instruction to clear it.
 */
function parseGoalCell(raw) {
  if (raw === undefined) return { list: undefined };

  const text = (raw || '').trim();
  if (!text) return { list: [] };

  const codes = text
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c !== '');

  const unknown = codes.filter((c) => !isGoalItem(c));
  if (unknown.length > 0) {
    return {
      error: `Invalid goals "${unknown.join(', ')}" (allowed: ${GOAL_ITEMS.join(', ')})`,
    };
  }
  if (new Set(codes).size !== codes.length) {
    return { error: 'Duplicate entries in goals' };
  }
  return { list: codes };
}

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
 *   name_en, purpose_en, instructions_en, name_es, purpose_es, instructions_es,
 *   muscles_primary, muscles_secondary, equipment, goals
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

    const primary = parseMuscleCell(rec.muscles_primary, 'muscles_primary');
    if (primary.error) {
      errors.push({ row: rowNumber, message: primary.error });
      return;
    }
    const secondary = parseMuscleCell(rec.muscles_secondary, 'muscles_secondary');
    if (secondary.error) {
      errors.push({ row: rowNumber, message: secondary.error });
      return;
    }
    const equipment = parseEquipmentCell(rec.equipment);
    if (equipment.error) {
      errors.push({ row: rowNumber, message: equipment.error });
      return;
    }
    const goals = parseGoalCell(rec.goals);
    if (goals.error) {
      errors.push({ row: rowNumber, message: goals.error });
      return;
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
      musclesPrimary: primary.list,
      musclesSecondary: secondary.list,
      equipment: equipment.list,
      goals: goals.list,
      ref,
    });
  });

  return { rows, errors };
}

// Re-exported so callers that only need the column list don't have to reach
// into csvExport.js directly.
export { CSV_EXPORT_COLUMNS };
