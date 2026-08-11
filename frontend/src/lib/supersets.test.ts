import { describe, it, expect } from 'vitest';
import {
  groupLetters,
  isLastGroupMember,
  buildAutoScrollOrder,
  nextOpenInOrder,
  buildRenderBlocks,
  groupEntries,
  ungroupEntries,
  type GroupableEntry,
} from './supersets';

const sets = (n: number, doneUpTo = -1): { done: boolean }[] =>
  Array.from({ length: n }, (_, i) => ({ done: i <= doneUpTo }));

describe('groupLetters', () => {
  it('leaves ungrouped entries undefined', () => {
    const entries: GroupableEntry[] = [{ sets: sets(1) }, { sets: sets(1) }];
    expect(groupLetters(entries)).toEqual([undefined, undefined]);
  });

  it('assigns A/B/C in array order within a group', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
    ];
    expect(groupLetters(entries)).toEqual(['A', 'B', 'C']);
  });

  it('restarts lettering per group', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
      { sets: sets(1) },
      { groupId: 'g2', sets: sets(1) },
      { groupId: 'g2', sets: sets(1) },
    ];
    expect(groupLetters(entries)).toEqual(['A', 'B', undefined, 'A', 'B']);
  });
});

describe('isLastGroupMember', () => {
  it('is true for every ungrouped entry', () => {
    const entries: GroupableEntry[] = [{ sets: sets(1) }];
    expect(isLastGroupMember(entries, 0)).toBe(true);
  });

  it('is false for every member but the last one in array order', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
    ];
    expect(isLastGroupMember(entries, 0)).toBe(false);
    expect(isLastGroupMember(entries, 1)).toBe(true);
  });

  it('finds the last member even when the group is not contiguous', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
    ];
    expect(isLastGroupMember(entries, 0)).toBe(false);
    expect(isLastGroupMember(entries, 2)).toBe(true);
  });
});

describe('buildAutoScrollOrder', () => {
  it('runs an ungrouped entry set by set', () => {
    const entries: GroupableEntry[] = [{ sets: sets(3) }];
    expect(buildAutoScrollOrder(entries)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });

  it('interleaves a two-member group as A1, B1, A2, B2', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(2) },
      { groupId: 'g1', sets: sets(2) },
    ];
    expect(buildAutoScrollOrder(entries)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it('skips a member once it runs out of sets, without stalling the round', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(2) },
    ];
    expect(buildAutoScrollOrder(entries)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it('resumes ungrouped entries after a group', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1) },
      { groupId: 'g1', sets: sets(1) },
      { sets: sets(1) },
    ];
    expect(buildAutoScrollOrder(entries)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });
});

describe('nextOpenInOrder', () => {
  it('finds the next undone set within a group, following A1 -> B1 -> A2 -> B2', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(2, 0) }, // A1 done
      { groupId: 'g1', sets: sets(2) },
    ];
    // Just finished A1 (0,0) -> next is B1 (1,0).
    expect(nextOpenInOrder(entries, 0, 0)).toEqual([1, 0]);
  });

  it('returns null once nothing is left open', () => {
    const entries: GroupableEntry[] = [{ sets: sets(1, 0) }];
    expect(nextOpenInOrder(entries, 0, 0)).toBeNull();
  });

  it('falls through to the next block when the current one is finished', () => {
    const entries: GroupableEntry[] = [
      { groupId: 'g1', sets: sets(1, 0) },
      { groupId: 'g1', sets: sets(1, 0) },
      { sets: sets(1) },
    ];
    expect(nextOpenInOrder(entries, 1, 0)).toEqual([2, 0]);
  });
});

describe('buildRenderBlocks', () => {
  it('gives every ungrouped entry its own single-index block', () => {
    expect(buildRenderBlocks([{}, {}])).toEqual([[0], [1]]);
  });

  it('collects a group into one block at its first member', () => {
    expect(buildRenderBlocks([{ groupId: 'g1' }, {}, { groupId: 'g1' }])).toEqual([[0, 2], [1]]);
  });
});

interface NamedEntry {
  id: string;
  groupId?: string;
}

describe('groupEntries', () => {
  it('does nothing for fewer than two indices', () => {
    const entries: NamedEntry[] = [{ id: 'a' }, { id: 'b' }];
    expect(groupEntries(entries, [0], 'g1')).toBe(entries);
  });

  it('tags the selected entries and moves them together at the first one', () => {
    const entries: NamedEntry[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = groupEntries(entries, [0, 2], 'g1');
    expect(result.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(result[0].groupId).toBe('g1');
    expect(result[1].groupId).toBe('g1');
    expect(result[2].groupId).toBeUndefined();
  });

  it('keeps selection order by original index, not selection order', () => {
    const entries: NamedEntry[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = groupEntries(entries, [2, 0], 'g1');
    expect(result.map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('ungroupEntries', () => {
  it('clears groupId only on matching members', () => {
    const entries = [
      { id: 'a', groupId: 'g1' },
      { id: 'b', groupId: 'g2' },
      { id: 'c', groupId: 'g1' },
    ];
    const result = ungroupEntries(entries, 'g1');
    expect(result.map((e) => e.groupId)).toEqual([undefined, 'g2', undefined]);
  });

  it('does not mutate the input', () => {
    const entries = [{ id: 'a', groupId: 'g1' }];
    ungroupEntries(entries, 'g1');
    expect(entries[0].groupId).toBe('g1');
  });
});
