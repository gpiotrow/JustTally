import type { Lang } from '../i18n';
import type { Exercise } from './types';

/**
 * Fallback order per active language. Spanish falls back to English first,
 * not German — the more likely second language for a Spanish-speaking user.
 */
const FALLBACK_ORDER: Record<Lang, readonly Lang[]> = {
  de: ['de', 'en', 'es'],
  en: ['en', 'de', 'es'],
  es: ['es', 'en', 'de'],
};

/** Pick the value for `lang`, falling back through the other languages in order. */
function pick(de: string, en: string, es: string, lang: Lang): string {
  const values: Record<Lang, string> = { de, en, es };
  for (const l of FALLBACK_ORDER[lang]) {
    const value = (values[l] || '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * Resolve an exercise's name, purpose and instructions for the active UI
 * language, falling back to whichever language is actually filled in.
 */
export function localizedExercise(
  exercise: Exercise,
  lang: Lang
): { name: string; purpose: string; instructions: string } {
  return {
    name: pick(exercise.nameDe, exercise.nameEn, exercise.nameEs, lang),
    purpose: pick(exercise.purposeDe, exercise.purposeEn, exercise.purposeEs, lang),
    instructions: pick(exercise.instructionsDe, exercise.instructionsEn, exercise.instructionsEs, lang),
  };
}
