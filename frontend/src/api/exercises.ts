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
  category: string;
  difficulty: Difficulty;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  exercises: Exercise[];
}

const CSV_COLUMNS = ['name_de', 'name_en', 'instructions_de', 'instructions_en', 'category', 'difficulty'];

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

/** A ready-to-edit CSV template (header + one bilingual example row). */
export function csvTemplate(): string {
  const example = [
    'Schulterdrücken',
    'Overhead Press',
    'Stange über Kopf drücken.',
    'Press the bar overhead.',
    'shoulders',
    'intermediate',
  ];
  return `${CSV_COLUMNS.join(',')}\n${example.map((v) => `"${v}"`).join(',')}\n`;
}
