import { api, getToken, ApiError } from './client';
import type { Exercise, Difficulty } from '../lib/types';
import type { MuscleGroup } from '../lib/muscles';
import type { EquipmentItem } from '../lib/equipment';
import type { GoalItem } from '../lib/goals';
import type { TrackingMode } from '../lib/tracking';
import type { MachineSetting } from '../lib/machineSettings';

interface ExercisesResponse {
  exercises: Exercise[];
  serverTime: number;
}

export interface ExerciseInput {
  nameDe: string;
  nameEn: string;
  nameEs: string;
  instructionsDe: string;
  instructionsEn: string;
  instructionsEs: string;
  category: string;
  difficulty: Difficulty;
  /** Optional reference number; leave undefined to auto-assign. */
  ref?: number;
  /** Muscle-group codes (§ 2.4); omitted leaves whatever is stored unchanged. */
  musclesPrimary?: MuscleGroup[];
  musclesSecondary?: MuscleGroup[];
  /** Equipment codes; omitted leaves whatever is stored unchanged. */
  equipment?: EquipmentItem[];
  /** Training-goal tags; omitted leaves whatever is stored unchanged. */
  goals?: GoalItem[];
  /** Which fields a set of this exercise records; omitted defaults to 'reps_weight'. */
  tracking?: TrackingMode;
  /** Adjustable machine settings this exercise exposes; omitted leaves whatever is stored unchanged. */
  settings?: MachineSetting[];
}

/**
 * merge   — insert new rows, skip rows that match an existing exercise
 * upsert  — insert new rows, update matched rows in place
 * replace — upsert, plus: any existing exercise absent from the CSV is archived
 */
export type ImportMode = 'merge' | 'upsert' | 'replace';

export interface ImportResult {
  dryRun: boolean;
  mode: ImportMode;
  imported: number;
  updated: number;
  skipped: number;
  /** mode=replace only: existing exercises archived because the CSV no longer lists them. */
  archived: number;
  /** Of the archived ones, how many are referenced by at least one workout. dryRun preview only. */
  archivedInUse?: number;
  /** Distinct users affected by the archiving, combined — not summed per exercise. */
  archivedAffectedUsers: number;
  errors: { row: number; message: string }[];
  /** Present on a real (non-dryRun) run: the rows that were inserted or updated. */
  exercises?: Exercise[];
}

export interface MediaBulkResult {
  assigned: { filename: string; ref: number; exerciseId: string }[];
  unmatched: { filename: string; reason: string }[];
  clearedExerciseIds: string[];
}

const CSV_COLUMNS = [
  'ref',
  'category',
  'difficulty',
  'muscles_primary',
  'muscles_secondary',
  'name_de',
  'name_en',
  'name_es',
  'goals',
  'instructions_de',
  'instructions_en',
  'instructions_es',
  'equipment',
  'tracking',
  'settings',
];

/** How many workouts (and distinct users) reference an exercise. */
export interface ExerciseUsage {
  workouts: number;
  users: number;
}

export interface DeleteExerciseResult {
  ok: boolean;
  /** True when the exercise was archived instead of deleted, because it is in use. */
  archived: boolean;
  deleted: boolean;
  usage: ExerciseUsage;
}

/**
 * @param includeArchived Admin catalog view; the mobile app omits it so archived
 *   exercises stay out of the pickable list.
 */
export function listExercises(includeArchived = false) {
  return api<ExercisesResponse>(`/exercises${includeArchived ? '?includeArchived=1' : ''}`);
}

export function unarchiveExercise(id: string) {
  return api<{ exercise: Exercise }>(`/exercises/${id}/unarchive`, { method: 'POST' });
}

export function getExerciseUsage(id: string) {
  return api<{ usage: ExerciseUsage }>(`/exercises/${id}/usage`);
}

export function getExercise(id: string) {
  return api<{ exercise: Exercise }>(`/exercises/${id}`);
}

export function createExercise(input: ExerciseInput) {
  return api<{ exercise: Exercise }>('/exercises', { method: 'POST', body: input });
}

export function updateExercise(id: string, input: ExerciseInput) {
  return api<{ exercise: Exercise }>(`/exercises/${id}`, { method: 'PUT', body: input });
}

/**
 * Remove an exercise. The server archives instead of deleting when any workout
 * still references it — check `archived` on the result to report what happened.
 */
export function deleteExercise(id: string) {
  return api<DeleteExerciseResult>(`/exercises/${id}`, { method: 'DELETE' });
}

export function uploadMedia(exerciseId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api<{ exercise: Exercise }>(`/exercises/${exerciseId}/media`, {
    method: 'POST',
    formData: fd,
  });
}

export function deleteMedia(exerciseId: string, mediaId: string) {
  return api<{ exercise: Exercise }>(`/exercises/${exerciseId}/media/${mediaId}`, {
    method: 'DELETE',
  });
}

export function importExercises(file: File, mode: ImportMode, dryRun = false) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('mode', mode);
  fd.append('dryRun', String(dryRun));
  return api<ImportResult>('/exercises/import', { method: 'POST', formData: fd });
}

/** Preview what an import would do without writing anything. */
export function previewImport(file: File, mode: ImportMode) {
  return importExercises(file, mode, true);
}

/**
 * Remove several exercises in one request. Referenced ones are archived rather
 * than deleted, so a mixed result is normal.
 */
export function bulkDeleteExercises(ids: string[]) {
  return api<{ archived: number; deleted: number }>('/exercises/bulk-delete', {
    method: 'POST',
    body: { ids },
  });
}

/**
 * Upload many media files at once. Each file is auto-assigned to the exercise
 * whose `ref` matches the file's leading digit run (e.g. "42_front.jpg" → ref 42).
 * Server-side cap on files per request; {@link bulkUploadMediaChunked} is the
 * caller most code should use instead of this directly.
 *
 * Mirrors `MAX_BULK_FILES` in `backend/src/routes/exercises.js` — the hard cap
 * a single request may carry. Uploads must stay at or below it.
 */
export const MAX_BULK_FILES = 10;

/**
 * How many files one chunked upload request carries. Deliberately below
 * {@link MAX_BULK_FILES} rather than equal to it, for two reasons:
 *
 *  - Progress: {@link bulkUploadMediaChunked} can only report after a whole
 *    chunk returns, so a chunk size equal to the cap would leave a
 *    cap-sized selection sitting at 0 until it is completely done — this
 *    broke once already when the two were briefly the same value.
 *  - Memory: the server buffers every file of a request in RAM before handling
 *    it, on a 512 MB machine. Smaller requests keep that peak far lower.
 *
 * The extra round trips cost little — total bytes on the wire are unchanged.
 */
export const UPLOAD_CHUNK_SIZE = 5;

export function bulkUploadMedia(files: File[], overwrite = false) {
  const fd = new FormData();
  for (const file of files) fd.append('files', file);
  fd.append('overwrite', String(overwrite));
  return api<MediaBulkResult>('/exercises/media/bulk', { method: 'POST', formData: fd });
}

/**
 * Split a large selection into server-sized chunks and upload sequentially,
 * merging the results as if it had been one request.
 *
 * `overwrite` is applied to the first chunk only, by design, not a bug: it
 * means "replace each matched exercise's existing media." Applying it to every
 * chunk would make chunk 2 delete the photos chunk 1 just uploaded, since both
 * chunks can contain files for the same exercise.
 */
export async function bulkUploadMediaChunked(
  files: File[],
  overwrite: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<MediaBulkResult> {
  const merged: MediaBulkResult = { assigned: [], unmatched: [], clearedExerciseIds: [] };
  const clearedExerciseIds = new Set<string>();

  for (let i = 0; i < files.length; i += UPLOAD_CHUNK_SIZE) {
    const chunk = files.slice(i, i + UPLOAD_CHUNK_SIZE);
    const result = await bulkUploadMedia(chunk, i === 0 && overwrite);
    merged.assigned.push(...result.assigned);
    merged.unmatched.push(...result.unmatched);
    result.clearedExerciseIds.forEach((id) => clearedExerciseIds.add(id));
    onProgress?.(Math.min(i + UPLOAD_CHUNK_SIZE, files.length), files.length);
  }

  merged.clearedExerciseIds = [...clearedExerciseIds];
  return merged;
}

/** Persist a new media display order; index 0 becomes the cover image. */
export function reorderMedia(exerciseId: string, mediaIds: string[]) {
  return api<{ exercise: Exercise }>(`/exercises/${exerciseId}/media/order`, {
    method: 'PUT',
    body: { mediaIds },
  });
}

/**
 * Download the full catalog as CSV. A plain `<a href>` cannot carry the
 * Authorization header this endpoint requires, so the file is fetched as a
 * blob and saved via a synthetic link instead.
 */
export async function downloadExerciseCsv(): Promise<void> {
  const token = getToken();
  const res = await fetch('/api/exercises/export.csv', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'just-tally-exercises.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** A ready-to-edit CSV template (header + one trilingual example row); `;`-delimited. */
export function csvTemplate(): string {
  const example = [
    // Left blank on purpose: any existing ref value here risks colliding with a
    // real exercise, since ref is optional and auto-assigned when omitted.
    '',
    'shoulders',
    'intermediate',
    // Comma-separated inside the cell; `;` already separates the columns.
    'front_delts,side_delts',
    'triceps,traps',
    'Schulterdrücken',
    'Overhead Press',
    'Press de hombros',
    'strength,muscle_gain',
    'Stange über Kopf drücken. Ellbogen leicht vor der Stange halten.',
    'Press the bar overhead. Keep elbows slightly in front of the bar.',
    'Empuja la barra por encima de la cabeza. Mantén los codos ligeramente delante de la barra.',
    'barbell,bench',
    'reps_weight',
    '',
  ];
  return `${CSV_COLUMNS.join(';')}\n${example.map((v) => `"${v}"`).join(';')}\n`;
}
