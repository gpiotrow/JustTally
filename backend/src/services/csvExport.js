/**
 * Column order mirrors `parseExercisesCsv` exactly, so an exported file can be
 * edited and re-imported without remapping headers.
 */
export const CSV_EXPORT_COLUMNS = [
  'ref',
  'category',
  'difficulty',
  'name_de',
  'purpose_de',
  'instructions_de',
  'name_en',
  'purpose_en',
  'instructions_en',
  'name_es',
  'purpose_es',
  'instructions_es',
];

/** Quote a field for `;`-delimited CSV, doubling any embedded quotes. */
function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Serialize exercises to the same CSV shape `parseExercisesCsv` reads, with
 * `ref` filled in — the difference that makes a re-import match every row by
 * number instead of guessing from names.
 *
 * @param {Array<{ref, category, difficulty, name_de, purpose_de, instructions_de,
 *   name_en, purpose_en, instructions_en, name_es, purpose_es, instructions_es}>} rows
 *   Raw exercise rows (snake_case, straight from the database).
 */
export function exercisesToCsv(rows) {
  const lines = [CSV_EXPORT_COLUMNS.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.ref,
        r.category,
        r.difficulty,
        r.name_de,
        r.purpose_de,
        r.instructions_de,
        r.name_en,
        r.purpose_en,
        r.instructions_en,
        r.name_es,
        r.purpose_es,
        r.instructions_es,
      ]
        .map(csvField)
        .join(';')
    );
  }
  return `${lines.join('\n')}\n`;
}
