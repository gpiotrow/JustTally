import { api } from './client';
import type { WorkoutSession } from '../lib/types';

export interface WorkoutDelete {
  id: string;
  deletedAt: number;
}

export interface WorkoutSyncRequest {
  lastSyncedAt: number;
  upserts: WorkoutSession[];
  deletes: WorkoutDelete[];
}

export interface WorkoutSyncResponse {
  workouts: WorkoutSession[];
  deletedIds: string[];
  serverTime: number;
}

export function syncWorkouts(payload: WorkoutSyncRequest) {
  return api<WorkoutSyncResponse>('/workouts/sync', { method: 'POST', body: payload });
}
