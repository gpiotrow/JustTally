import { api } from './client';
import type { BodyWeight } from '../lib/types';

export interface BodyWeightDelete {
  id: string;
  deletedAt: number;
}

export interface BodyWeightSyncRequest {
  lastSyncedAt: number;
  upserts: BodyWeight[];
  deletes: BodyWeightDelete[];
}

export interface BodyWeightSyncResponse {
  bodyWeights: BodyWeight[];
  deletedIds: string[];
  serverTime: number;
}

export function syncBodyWeights(payload: BodyWeightSyncRequest) {
  return api<BodyWeightSyncResponse>('/body-weights/sync', { method: 'POST', body: payload });
}
