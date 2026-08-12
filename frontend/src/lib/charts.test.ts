import { describe, it, expect } from 'vitest';
import { scalePoints } from './charts';

const opts = { width: 100, height: 50, padding: 10 };

describe('scalePoints', () => {
  it('returns an empty array for no points', () => {
    expect(scalePoints([], opts)).toEqual([]);
  });

  it('places a single point at the left padding edge, vertically centered', () => {
    const [p] = scalePoints([{ date: 1, value: 5 }], opts);
    expect(p.x).toBe(10);
    // range collapses to 1 for a single point, so y sits at padding + plotHeight - 0 = bottom of the plot area.
    expect(p.y).toBe(10 + 30);
  });

  it('spreads points evenly across the plot width', () => {
    const points = [
      { date: 1, value: 0 },
      { date: 2, value: 0 },
      { date: 3, value: 0 },
    ];
    const scaled = scalePoints(points, opts);
    expect(scaled.map((p) => p.x)).toEqual([10, 50, 90]);
  });

  it('maps the minimum value to the bottom and the maximum to the top', () => {
    const points = [
      { date: 1, value: 10 },
      { date: 2, value: 20 },
    ];
    const scaled = scalePoints(points, opts);
    // SVG y grows downward: the higher value must have the smaller y.
    expect(scaled[1].y).toBeLessThan(scaled[0].y);
    expect(scaled[0].y).toBe(10 + 30); // min -> bottom of plot area
    expect(scaled[1].y).toBe(10); // max -> top of plot area
  });

  it('draws a flat line at mid-height when every value is equal', () => {
    const points = [
      { date: 1, value: 7 },
      { date: 2, value: 7 },
    ];
    const scaled = scalePoints(points, opts);
    expect(scaled[0].y).toBe(scaled[1].y);
  });

  it('carries the reliable flag through unchanged', () => {
    const [p] = scalePoints([{ date: 1, value: 5, reliable: false }], opts);
    expect(p.reliable).toBe(false);
  });
});
