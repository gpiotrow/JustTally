import { api } from './client';
import type { Routine } from '../lib/types';

export interface RoutineDelete {
  id: string;
  deletedAt: number;
}

export interface RoutineSyncRequest {
  lastSyncedAt: number;
  upserts: Routine[];
  deletes: RoutineDelete[];
}

export interface RoutineSyncResponse {
  routines: Routine[];
  deletedIds: string[];
  serverTime: number;
}

export function syncRoutines(payload: RoutineSyncRequest) {
  return api<RoutineSyncResponse>('/routines/sync', { method: 'POST', body: payload });
}
