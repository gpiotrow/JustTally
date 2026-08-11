/**
 * The arithmetic of a sync round, kept away from React and IndexedDB so it can
 * be reasoned about and tested on its own.
 *
 * Every function here exists to close a window in which a workout could be
 * lost. They all share one premise: **a request takes time, and the user keeps
 * training while it is in flight.** Anything that assumes local state stood
 * still between sending and receiving is a bug waiting for a slow connection.
 */

export interface Syncable {
  id: string;
  updatedAt: number;
}

export interface PendingDelete {
  id: string;
  deletedAt: number;
}

export interface MergeInput<T extends Syncable> {
  /** Local state as it is *now* — re-read after the response, not the snapshot that was sent. */
  local: readonly T[];
  /** Rows the server considers newer. */
  incoming: readonly T[];
  /** Rows the server considers deleted. */
  deletedIds: readonly string[];
  /**
   * Ids with local changes that have not reached the server yet. They are
   * protected from a remote delete — see below.
   */
  dirtyIds?: ReadonlySet<string>;
}

/**
 * Fold a server response into local state.
 *
 * **Last-write-wins is applied on the client too.** The server echoes back
 * every row it considers newer than `lastSyncedAt`, including the ones we just
 * pushed. If the user edited a session while the request was in flight, that
 * echo is *older* than what is on the device, and blindly taking it would
 * silently undo the edit. So an incoming row only wins when it is not older
 * than the local one.
 *
 * **A remote delete never removes a session with unpushed changes.** Normally
 * the two cannot collide: a dirty session is pushed in the same request, the
 * server resurrects the row (`deleted_at = NULL`) and leaves it out of
 * `deletedIds`. But when the push was skipped or rejected, the delete would
 * arrive against an edit that no server has ever seen — and deleting it here
 * would destroy the only copy. Keeping it costs at most one redundant round
 * trip; the delete will be re-reported next time, once the edit is safe.
 */
export function mergeSynced<T extends Syncable>({
  local,
  incoming,
  deletedIds,
  dirtyIds,
}: MergeInput<T>): T[] {
  const byId = new Map(local.map((item) => [item.id, item]));

  for (const item of incoming) {
    const current = byId.get(item.id);
    if (current && current.updatedAt > item.updatedAt) continue;
    byId.set(item.id, item);
  }

  for (const id of deletedIds) {
    if (dirtyIds?.has(id)) continue;
    byId.delete(id);
  }

  return [...byId.values()];
}

/**
 * Which ids stay queued after a push.
 *
 * `pushed` maps id → the `updatedAt` that was actually sent. An id clears only
 * if the server received exactly what the device holds now. Anything edited
 * between sending and receiving carries a newer `updatedAt` and stays queued,
 * because what the server has is already out of date.
 *
 * Ids that vanished locally (deleted mid-flight) leave the dirty queue — the
 * delete queue owns them from that point on, and keeping them in both would
 * push a session that no longer exists.
 */
export function remainingDirty<T extends Syncable>(
  currentDirty: readonly string[],
  pushed: ReadonlyMap<string, number>,
  localById: ReadonlyMap<string, T>
): string[] {
  return currentDirty.filter((id) => {
    const sentUpdatedAt = pushed.get(id);
    if (sentUpdatedAt === undefined) return true; // queued during the request

    const local = localById.get(id);
    if (!local) return false; // deleted meanwhile; the delete queue has it

    return local.updatedAt > sentUpdatedAt; // edited again since it was sent
  });
}

/**
 * Which deletions stay queued after a push — the same rule, keyed on
 * `deletedAt`. Clearing the queue wholesale (the previous behaviour) dropped
 * any deletion made while the request was in flight: the session was already
 * gone from the device but the server never heard about it, so the next pull
 * brought it back from the dead.
 */
export function remainingDeletes(
  currentDeletes: readonly PendingDelete[],
  pushed: ReadonlyMap<string, number>
): PendingDelete[] {
  return currentDeletes.filter((entry) => {
    const sentDeletedAt = pushed.get(entry.id);
    if (sentDeletedAt === undefined) return true;
    return entry.deletedAt > sentDeletedAt;
  });
}

/** Newest first, by explicit start time where there is one. */
export function sortByRecency<T extends { startedAt?: number; date: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.startedAt ?? b.date) - (a.startedAt ?? a.date));
}
