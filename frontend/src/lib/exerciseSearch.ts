/**
 * Name matching for every place the catalog is searched.
 *
 * The naive `name.toLowerCase().includes(query.toLowerCase())` that this
 * replaces fails exactly where it hurts most: a German catalog full of
 * "Bankdrücken" and "Schrägbankdrücken" typed one-handed on a phone keyboard,
 * where nobody reaches for the umlaut key mid-workout. Folding both sides to
 * their unaccented form makes "bankdrucken" find "Bankdrücken" and "biceps"
 * find "Bíceps" without keeping a table of spelling variants.
 *
 * Not handled, deliberately: the German "ue"/"oe"/"ae" transliteration
 * ("bankdruecken"). Expanding it would need the reverse rule too, and that
 * rewrites innocent words — "quer" would become "qur" — for a spelling almost
 * nobody types into a search field.
 */

/** Marks left behind by NFD decomposition: the accents themselves. */
const COMBINING_MARKS = /\p{Mn}/gu;

/**
 * Lower-case, accent-free, whitespace-trimmed form used for comparison.
 *
 * `ß` is folded separately because it is not a decomposable accent — NFD
 * leaves it as-is, so "Gesäss" would otherwise miss "Gesäß".
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .trim();
}

/**
 * Does `name` match what the user typed?
 *
 * Every whitespace-separated token of the query has to appear somewhere in the
 * name, in any order. That is a superset of a plain substring test, and it buys
 * the compound-word case for free: "bank drucken" finds "Bankdrücken", which a
 * single `includes` never would.
 *
 * A blank query matches everything — the caller filters nothing rather than
 * having to special-case the empty field.
 */
export function matchesQuery(name: string, query: string): boolean {
  const tokens = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const folded = foldForSearch(name);
  return tokens.every((token) => folded.includes(token));
}
