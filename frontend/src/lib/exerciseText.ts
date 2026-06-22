import type { Lang } from '../i18n';
import type { Exercise } from './types';

/** Pick the value for `lang`; fall back to the other language if it's empty. */
function pick(de: string, en: string, lang: Lang): string {
  const primary = lang === 'de' ? de : en;
  const fallback = lang === 'de' ? en : de;
  return (primary || '').trim() || (fallback || '').trim();
}

/**
 * Resolve an exercise's name and instructions for the active UI language,
 * falling back to whichever language is actually filled in.
 */
export function localizedExercise(
  exercise: Exercise,
  lang: Lang
): { name: string; instructions: string } {
  return {
    name: pick(exercise.nameDe, exercise.nameEn, lang),
    instructions: pick(exercise.instructionsDe, exercise.instructionsEn, lang),
  };
}
