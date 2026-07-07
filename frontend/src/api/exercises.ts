import { api } from './client';
import type { Exercise, Difficulty } from '../lib/types';

interface ExercisesResponse {
  exercises: Exercise[];
  serverTime: number;
}

export interface ExerciseInput {
  nameDe: string;
  nameEn: string;
  instructionsDe: string;
  instructionsEn: string;
  tipsDe: string;
  tipsEn: string;
  category: string;
  difficulty: Difficulty;
  /** Optional reference number; leave undefined to auto-assign. */
  ref?: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  exercises: Exercise[];
}

export interface MediaBulkResult {
  assigned: { filename: string; ref: number; exerciseId: string }[];
  unmatched: { filename: string; reason: string }[];
}

const CSV_COLUMNS = [
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

export function listExercises() {
  return api<ExercisesResponse>('/exercises');
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

export function deleteExercise(id: string) {
  return api<{ ok: boolean }>(`/exercises/${id}`, { method: 'DELETE' });
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

export function importExercises(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api<ImportResult>('/exercises/import', { method: 'POST', formData: fd });
}

/** Delete several exercises (and their media) in one request. */
export function bulkDeleteExercises(ids: string[]) {
  return api<{ deleted: number }>('/exercises/bulk-delete', {
    method: 'POST',
    body: { ids },
  });
}

/**
 * Upload many media files at once. Each file is auto-assigned to the exercise
 * whose `ref` matches the file's leading digit run (e.g. "42_front.jpg" → ref 42).
 */
export function bulkUploadMedia(files: File[]) {
  const fd = new FormData();
  for (const file of files) fd.append('files', file);
  return api<MediaBulkResult>('/exercises/media/bulk', { method: 'POST', formData: fd });
}

/** A ready-to-edit CSV template (header + one bilingual example row); `;`-delimited. */
export function csvTemplate(): string {
  const example = [
    'Schulterdrücken',
    'Overhead Press',
    'Stange über Kopf drücken.',
    'Press the bar overhead.',
    'Ellbogen leicht vor der Stange halten.',
    'Keep elbows slightly in front of the bar.',
    'shoulders',
    'intermediate',
    // Left blank on purpose: any existing ref value here risks colliding with a
    // real exercise, since ref is optional and auto-assigned when omitted.
    '',
  ];
  return `${CSV_COLUMNS.join(';')}\n${example.map((v) => `"${v}"`).join(';')}\n`;
}
