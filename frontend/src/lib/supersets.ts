/**
 * Pure grouping logic for supersets: a flat entries array with an optional
 * shared `groupId` renders as one card with lettered members, and check-off
 * interleaves their sets (A1, B1, A2, B2) instead of finishing one exercise
 * before starting the next.
 *
 * Kept generic over the entry shape so it works against both `DraftEntry`
 * (Workout.tsx, string reps/weight while editing) and `WorkoutSet`-backed
 * entries, without either side importing the other's types.
 */

export interface GroupableEntry {
  groupId?: string;
  sets: { done: boolean }[];
}

/** A/B/C… per entry, in the order group members appear in the array. `undefined` for ungrouped entries. */
export function groupLetters(entries: GroupableEntry[]): (string | undefined)[] {
  const nextIndex = new Map<string, number>();
  return entries.map((entry) => {
    if (!entry.groupId) return undefined;
    const index = nextIndex.get(entry.groupId) ?? 0;
    nextIndex.set(entry.groupId, index + 1);
    return String.fromCharCode(65 + index);
  });
}

/**
 * True for ungrouped entries and for the last member of a group — the one
 * whose check-off should start the rest timer. A superset's whole point is
 * no rest between its own exercises, only after the round is done.
 */
export function isLastGroupMember(entries: GroupableEntry[], entryIndex: number): boolean {
  const groupId = entries[entryIndex]?.groupId;
  if (!groupId) return true;
  return !entries.some((entry, i) => i > entryIndex && entry.groupId === groupId);
}

/**
 * The full check-off traversal order as [entryIndex, setIndex] pairs.
 * Ungrouped entries run set-by-set; grouped entries interleave round by
 * round across their members, wherever in the array those members sit.
 */
export function buildAutoScrollOrder(entries: GroupableEntry[]): [number, number][] {
  const order: [number, number][] = [];
  const seen = new Set<number>();
  entries.forEach((entry, ei) => {
    if (seen.has(ei)) return;
    if (!entry.groupId) {
      entry.sets.forEach((_, si) => order.push([ei, si]));
      seen.add(ei);
      return;
    }
    const members: number[] = [];
    entries.forEach((e, i) => {
      if (e.groupId === entry.groupId) members.push(i);
    });
    members.forEach((i) => seen.add(i));
    const maxSets = Math.max(...members.map((i) => entries[i].sets.length));
    for (let si = 0; si < maxSets; si += 1) {
      for (const i of members) {
        if (si < entries[i].sets.length) order.push([i, si]);
      }
    }
  });
  return order;
}

/** The next undone set after the one just finished, following the auto-scroll order. */
export function nextOpenInOrder(
  entries: GroupableEntry[],
  fromEntry: number,
  fromSet: number
): [number, number] | null {
  const order = buildAutoScrollOrder(entries);
  const at = order.findIndex(([ei, si]) => ei === fromEntry && si === fromSet);
  for (let i = at + 1; i < order.length; i += 1) {
    const [ei, si] = order[i];
    if (!entries[ei].sets[si].done) return order[i];
  }
  return null;
}

/**
 * Entry indices grouped into render blocks: `[i]` for an ungrouped entry,
 * or every member's index (in array order) for a group — collected at the
 * position of its first member so a group renders as one card wherever its
 * members sit, contiguous or not.
 */
export function buildRenderBlocks(entries: { groupId?: string }[]): number[][] {
  const blocks: number[][] = [];
  const seen = new Set<number>();
  entries.forEach((entry, i) => {
    if (seen.has(i)) return;
    if (!entry.groupId) {
      seen.add(i);
      blocks.push([i]);
      return;
    }
    const members: number[] = [];
    entries.forEach((e, j) => {
      if (e.groupId === entry.groupId) members.push(j);
    });
    members.forEach((j) => seen.add(j));
    blocks.push(members);
  });
  return blocks;
}

/**
 * Clamps the entries at `indices` (at least two) into a new superset: they
 * take on `groupId` and move together to the position of the first selected
 * entry, so the group renders as one contiguous card. Everything else keeps
 * its relative order. Fewer than two indices is a no-op — a "group" of one
 * is not a superset.
 */
export function groupEntries<T extends { groupId?: string }>(
  entries: T[],
  indices: number[],
  groupId: string
): T[] {
  if (indices.length < 2) return entries;
  const sorted = [...indices].sort((a, b) => a - b);
  const selected = new Set(sorted);
  const result: T[] = [];
  let inserted = false;
  entries.forEach((entry, i) => {
    if (selected.has(i)) {
      if (!inserted) {
        sorted.forEach((j) => result.push({ ...entries[j], groupId }));
        inserted = true;
      }
      return;
    }
    result.push(entry);
  });
  return result;
}

/** Removes every member of `groupId` from its group, in place order. */
export function ungroupEntries<T extends { groupId?: string }>(entries: T[], groupId: string): T[] {
  return entries.map((entry) => {
    if (entry.groupId !== groupId) return entry;
    const next = { ...entry };
    delete next.groupId;
    return next;
  });
}
