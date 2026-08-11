import { describe, it, expect } from 'vitest';
import { shouldSwipe, SWIPE_THRESHOLD_RATIO } from './swipeGesture';

describe('shouldSwipe', () => {
  it('is false for a small movement', () => {
    expect(shouldSwipe(10, 300)).toBe(false);
  });

  it('is true once the drag crosses the threshold ratio of the card width', () => {
    const width = 300;
    expect(shouldSwipe(width * SWIPE_THRESHOLD_RATIO + 1, width)).toBe(true);
  });

  it('is false exactly at the boundary minus one', () => {
    const width = 300;
    expect(shouldSwipe(width * SWIPE_THRESHOLD_RATIO - 1, width)).toBe(false);
  });

  it('ignores direction — a swipe right counts the same as left', () => {
    expect(shouldSwipe(-100, 300)).toBe(true);
  });

  it('is false for a non-positive card width', () => {
    expect(shouldSwipe(100, 0)).toBe(false);
    expect(shouldSwipe(100, -50)).toBe(false);
  });
});
