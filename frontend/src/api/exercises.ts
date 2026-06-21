import { api } from './client';
import type { Exercise, Difficulty } from '../lib/types';

interface ExercisesResponse {
  exercises: Exercise[];
  serverTime: number;
}

export interface ExerciseInput {
  name: string;
  category: string;
  difficulty: Difficulty;
  instructions: string;
}

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
