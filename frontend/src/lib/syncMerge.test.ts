import { describe, it, expect } from 'vitest';
import {
  mergeSynced,
  remainingDeletes,
  remainingDirty,
  sortByRecency,
  type PendingDelete,
  type Syncable,
} from './syncMerge';

interface Session extends Syncable {
  title?: string;
}

const s = (id: string, updatedAt: number, title?: string): Session => ({ id, updatedAt, title });

describe('mergeSynced', () => {
  it('adds rows the device has never seen', () => {
    const merged = mergeSynced({ local: [s('a', 1)], incoming: [s('b', 2)], deletedIds: [] });
    expect(merged.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the server row when it is newer', () => {
    const merged = mergeSynced({
      local: [s('a', 1, 'old')],
      incoming: [s('a', 5, 'new')],
      deletedIds: [],
    });
    expect(merged).toEqual([s('a', 5, 'new')]);
  });

  it('keeps the local row when it is newer than the echo', () => {
    // The window this closes: the user edits a session while the sync request
    // is in flight. The server echoes back what it received — which is now
    // older than what the device holds — and taking it would undo the edit.
    const merged = mergeSynced({
      local: [s('a', 9, 'edited during the request')],
      incoming: [s('a', 5, 'what the server received')],
      deletedIds: [],
    });
    expect(merged).toEqual([s('a', 9, 'edited during the request')]);
  });

  it('prefers the server row on an equal timestamp', () => {
    const merged = mergeSynced({
      local: [s('a', 5, 'local')],
      incoming: [s('a', 5, 'server')],
      deletedIds: [],
    });
    expect(merged).toEqual([s('a', 5, 'server')]);
  });

  it('removes rows the server reports as deleted', () => {
    const merged = mergeSynced({ local: [s('a', 1), s('b', 1)], incoming: [], deletedIds: ['a'] });
    expect(merged.map((x) => x.id)).toEqual(['b']);
  });

  it('refuses a remote delete for a session with unpushed changes', () => {
    // Deleting here would destroy the only copy of an edit no server has seen.
    const merged = mergeSynced({
      local: [s('a', 9, 'never reached the server')],
      incoming: [],
      deletedIds: ['a'],
      dirtyIds: new Set(['a']),
    });
    expect(merged).toEqual([s('a', 9, 'never reached the server')]);
  });

  it('still applies a remote delete to a clean session', () => {
    const merged = mergeSynced({
      local: [s('a', 9)],
      incoming: [],
      deletedIds: ['a'],
      dirtyIds: new Set(['other']),
    });
    expect(merged).toEqual([]);
  });

  it('applies a delete that arrives together with an older echo of the same row', () => {
    const merged = mergeSynced({ local: [s('a', 1)], incoming: [s('a', 2)], deletedIds: ['a'] });
    expect(merged).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const local = [s('a', 1)];
    mergeSynced({ local, incoming: [s('a', 2)], deletedIds: ['a'] });
    expect(local).toEqual([s('a', 1)]);
  });

  it('returns an empty list for an empty round', () => {
    expect(mergeSynced({ local: [], incoming: [], deletedIds: [] })).toEqual([]);
  });
});

describe('remainingDirty', () => {
  const localById = (items: Session[]) => new Map(items.map((i) => [i.id, i]));

  it('clears an id whose pushed version matches what the device holds', () => {
    expect(remainingDirty(['a'], new Map([['a', 5]]), localById([s('a', 5)]))).toEqual([]);
  });

  it('keeps an id that was queued while the request was in flight', () => {
    expect(remainingDirty(['a', 'b'], new Map([['a', 5]]), localById([s('a', 5), s('b', 7)]))).toEqual(
      ['b']
    );
  });

  it('keeps an id that was edited again after it was sent', () => {
    // Otherwise this edit is marked as synced while the server still has the
    // older copy — and nothing would ever push it again.
    expect(remainingDirty(['a'], new Map([['a', 5]]), localById([s('a', 9)]))).toEqual(['a']);
  });

  it('drops an id that was deleted locally while the request was in flight', () => {
    // The delete queue owns it now; pushing a session that no longer exists
    // would resurrect it on the server.
    expect(remainingDirty(['a'], new Map([['a', 5]]), localById([]))).toEqual([]);
  });

  it('is empty when nothing was queued', () => {
    expect(remainingDirty([], new Map(), localById([]))).toEqual([]);
  });
});

describe('remainingDeletes', () => {
  const del = (id: string, deletedAt: number): PendingDelete => ({ id, deletedAt });

  it('clears a deletion the server acknowledged', () => {
    expect(remainingDeletes([del('a', 5)], new Map([['a', 5]]))).toEqual([]);
  });

  it('keeps a deletion made while the request was in flight', () => {
    // The previous behaviour cleared the queue wholesale, so this deletion was
    // lost: gone from the device, never sent, and resurrected by the next pull.
    expect(remainingDeletes([del('a', 5), del('b', 9)], new Map([['a', 5]]))).toEqual([del('b', 9)]);
  });

  it('keeps a deletion that was re-issued after it was sent', () => {
    expect(remainingDeletes([del('a', 9)], new Map([['a', 5]]))).toEqual([del('a', 9)]);
  });

  it('is empty when nothing was queued', () => {
    expect(remainingDeletes([], new Map())).toEqual([]);
  });
});

describe('sortByRecency', () => {
  it('puts the most recent session first', () => {
    const items = [
      { id: 'old', date: 100 },
      { id: 'new', date: 300 },
      { id: 'mid', date: 200 },
    ];
    expect(sortByRecency(items).map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('prefers an explicit start time over the save timestamp', () => {
    const items = [
      { id: 'saved-later-trained-earlier', date: 900, startedAt: 100 },
      { id: 'saved-earlier-trained-later', date: 800, startedAt: 500 },
    ];
    expect(sortByRecency(items)[0].id).toBe('saved-earlier-trained-later');
  });

  it('does not mutate its input', () => {
    const items = [{ id: 'a', date: 1 }, { id: 'b', date: 2 }];
    sortByRecency(items);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
