import { scalePoints, type ChartPoint } from '../../lib/charts';

interface TrendChartProps {
  points: ChartPoint[];
  variant?: 'line' | 'bar';
  height?: number;
  formatValue?: (value: number) => string;
  formatDate?: (date: number) => string;
  label: string;
  className?: string;
}

const WIDTH = 320;
const PADDING = 10;

/**
 * A hand-written SVG line or bar chart — no charting library (§ 15, cost vs.
 * two chart types not worth the bundle). `stroke`/`fill` are always
 * `currentColor`, matching `icons.tsx`'s convention, so the caller's
 * `text-*` class carries the theme through both themes for free.
 *
 * A point with `reliable: false` (an e1RM estimate from a set past the
 * rep range the Epley formula stays accurate for) renders as a hollow
 * marker instead of a solid one — the chart must not visually claim more
 * certainty than the number underneath it has.
 */
export function TrendChart({
  points,
  variant = 'line',
  height = 120,
  formatValue = String,
  formatDate,
  label,
  className,
}: TrendChartProps) {
  if (points.length === 0) return null;

  const scaled = scalePoints(points, { width: WIDTH, height, padding: PADDING });
  const tooltip = (p: ChartPoint) => `${formatDate ? formatDate(p.date) : ''}: ${formatValue(p.value)}`;
  const barWidth = Math.min(24, (WIDTH - PADDING * 2) / Math.max(points.length, 1) - 4);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className={`w-full text-accent ${className ?? ''}`}
      role="img"
      aria-label={label}
    >
      {variant === 'bar' &&
        scaled.map((p, i) => (
          <rect
            key={i}
            x={p.x - barWidth / 2}
            y={p.y}
            width={Math.max(barWidth, 1)}
            height={Math.max(height - PADDING - p.y, 0)}
            rx={2}
            fill="currentColor"
            opacity={p.reliable === false ? 0.45 : 0.85}
          >
            <title>{tooltip(p)}</title>
          </rect>
        ))}

      {variant === 'line' && (
        <path
          d={scaled.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {variant === 'line' &&
        scaled.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={p.reliable === false ? 'none' : 'currentColor'}
            stroke="currentColor"
            strokeWidth={p.reliable === false ? 1.75 : 0}
          >
            <title>{tooltip(p)}</title>
          </circle>
        ))}
    </svg>
  );
}
