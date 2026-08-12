/** One data point going into a chart. */
export interface ChartPoint {
  date: number;
  value: number;
  /** Rendered as a hollow marker instead of a solid one — e.g. an unreliable e1RM estimate. */
  reliable?: boolean;
}

/** A point already placed in SVG pixel space. */
export interface ScaledPoint extends ChartPoint {
  x: number;
  y: number;
}

export interface ScaleOptions {
  width: number;
  height: number;
  padding: number;
}

/**
 * Map data points onto an SVG viewBox: x spreads points evenly left to right,
 * y maps the value range onto the plot's vertical space (inverted — SVG y
 * grows downward, a chart's value should grow upward).
 *
 * Pure and separated from `TrendChart.tsx` on purpose: this is the part worth
 * a unit test (off-by-ones in axis math are easy to get wrong and hard to
 * spot by eye), the component around it is just markup.
 */
export function scalePoints(points: ChartPoint[], options: ScaleOptions): ScaledPoint[] {
  const { width, height, padding } = options;
  if (points.length === 0) return [];

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Every point equal (including a single point) would divide by zero;
  // falling back to 1 draws a flat line/row of bars instead of crashing.
  const range = max - min || 1;

  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  return points.map((p, i) => ({
    ...p,
    x: padding + i * stepX,
    y: padding + plotHeight - ((p.value - min) / range) * plotHeight,
  }));
}
