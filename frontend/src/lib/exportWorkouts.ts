import type { Unit } from './units';
import { EXPORT_FORMAT, type ExportBundle, type JustTallyExportV1 } from './exportSchema';

/**
 * Wrap the app's own data in the export envelope. Pure and synchronous: the
 * data is already in memory (IndexedDB-backed hooks, offline-first), so
 * building the file needs no network round trip and works offline — the
 * point of a feature whose purpose is data independence.
 */
export function buildExport(bundle: ExportBundle, displayUnit: Unit): JustTallyExportV1 {
  return {
    format: EXPORT_FORMAT,
    exportedAt: Date.now(),
    displayUnit,
    exercises: bundle.exercises,
    routines: bundle.routines,
    bodyWeights: bundle.bodyWeights,
    sessions: bundle.sessions,
  };
}
