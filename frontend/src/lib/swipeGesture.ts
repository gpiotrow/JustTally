/**
 * How far a horizontal drag has to travel, relative to the card it started
 * on, before it counts as a deliberate swipe rather than a scroll wobble or
 * a slightly-off tap.
 */
export const SWIPE_THRESHOLD_RATIO = 0.25;

/** Whether a horizontal drag of `deltaX` over a card `cardWidth` wide should trigger its action. */
export function shouldSwipe(deltaX: number, cardWidth: number): boolean {
  if (cardWidth <= 0) return false;
  return Math.abs(deltaX) >= cardWidth * SWIPE_THRESHOLD_RATIO;
}
