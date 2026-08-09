/**
 * Column order mirrors `parseExercisesCsv` exactly, so an exported file can be
 * edited and re-imported without remapping headers.
 */
export const CSV_EXPORT_COLUMNS = [
  'name_de',
  'name_en',
  'instructions_de',
  'instructions_en',
  'tips_de',
  'tips_en',
  'category',
  'difficulty',
  'ref',
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
 * @param {Array<{name_de, name_en, instructions_de, instructions_en, tips_de, tips_en, category, difficulty, ref}>} rows
 *   Raw exercise rows (snake_case, straight from the database).
 */
export function exercisesToCsv(rows) {
  const lines = [CSV_EXPORT_COLUMNS.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.name_de,
        r.name_en,
        r.instructions_de,
        r.instructions_en,
        r.tips_de,
        r.tips_en,
        r.category,
        r.difficulty,
        r.ref,
      ]
        .map(csvField)
        .join(';')
    );
  }
  return `${lines.join('\n')}\n`;
}
