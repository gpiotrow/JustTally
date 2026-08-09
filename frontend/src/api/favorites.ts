import { api } from './client';

interface FavoritesResponse {
  exerciseIds: string[];
}

/** The caller's favorite exercise ids, oldest first. */
export function listFavorites() {
  return api<FavoritesResponse>('/favorites');
}

/** Idempotent: marking an existing favorite again succeeds and changes nothing. */
export function addFavorite(exerciseId: string) {
  return api<{ ok: boolean; favorite: boolean }>(`/favorites/${exerciseId}`, { method: 'PUT' });
}

/** Succeeds even when the favorite was not stored, so a retry is never an error. */
export function removeFavorite(exerciseId: string) {
  return api<{ ok: boolean; favorite: boolean }>(`/favorites/${exerciseId}`, { method: 'DELETE' });
}
