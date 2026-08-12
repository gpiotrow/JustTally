import type { MuscleGroup } from '../lib/muscles';

/**
 * Simplified body silhouettes with one path per muscle group, drawn by hand
 * to match the project's other hand-written SVG (icons.tsx, TrendChart.tsx)
 * rather than pulled from a template with an unclear licence.
 *
 * Deliberately schematic, not anatomical: the shapes only need to be
 * recognisable enough to point at, and a simple polygon is far easier to keep
 * aligned across two views than a traced anatomy drawing would be. Both views
 * share one 100×220 coordinate space.
 */

type PathMap = Partial<Record<MuscleGroup, string>>;

const FRONT: PathMap = {
  front_delts: 'M30 52 L22 56 L20 70 L30 68 Z M70 52 L78 56 L80 70 L70 68 Z',
  side_delts: 'M22 56 L16 62 L16 76 L20 70 Z M78 56 L84 62 L84 76 L80 70 Z',
  chest: 'M32 52 L50 56 L50 80 L32 76 Z M68 52 L50 56 L50 80 L68 76 Z',
  biceps: 'M20 72 L16 78 L18 96 L26 94 L28 78 Z M80 72 L84 78 L82 96 L74 94 L72 78 Z',
  forearms: 'M18 98 L15 104 L17 126 L25 124 L26 100 Z M82 98 L85 104 L83 126 L75 124 L74 100 Z',
  abs: 'M40 82 L60 82 L58 116 L42 116 Z',
  obliques: 'M32 80 L39 82 L41 114 L33 108 Z M68 80 L61 82 L59 114 L67 108 Z',
  quads: 'M36 124 L48 124 L46 168 L34 166 Z M64 124 L52 124 L54 168 L66 166 Z',
};

const BACK: PathMap = {
  traps: 'M38 44 L50 40 L62 44 L58 62 L50 58 L42 62 Z',
  rear_delts: 'M30 52 L22 56 L20 70 L30 68 Z M70 52 L78 56 L80 70 L70 68 Z',
  lats: 'M34 62 L48 64 L48 96 L32 86 Z M66 62 L52 64 L52 96 L68 86 Z',
  triceps: 'M20 72 L16 78 L18 96 L26 94 L28 78 Z M80 72 L84 78 L82 96 L74 94 L72 78 Z',
  lower_back: 'M40 98 L60 98 L58 118 L42 118 Z',
  glutes: 'M36 120 L50 118 L50 142 L36 140 Z M64 120 L50 118 L50 142 L64 140 Z',
  hamstrings: 'M36 144 L48 144 L46 178 L35 176 Z M64 144 L52 144 L54 178 L65 176 Z',
  calves: 'M36 182 L46 182 L45 208 L36 206 Z M64 182 L54 182 L55 208 L64 206 Z',
};

/** Head and outline, drawn under the muscle paths so the figure reads as a body. */
const SILHOUETTE =
  'M50 12 C56 12 60 17 60 24 C60 31 56 36 50 36 C44 36 40 31 40 24 C40 17 44 12 50 12 Z ' +
  'M50 38 C64 38 76 44 82 56 L86 78 L84 128 L78 128 L74 96 L70 128 L68 176 L64 212 L54 212 ' +
  'L52 150 L48 150 L46 212 L36 212 L32 176 L30 128 L26 96 L22 128 L16 128 L14 78 L18 56 ' +
  'C24 44 36 38 50 38 Z';

export interface BodyMapProps {
  view: 'front' | 'back';
  /** 0…1 per muscle; groups absent from the map render as untrained. */
  values: Partial<Record<MuscleGroup, number>>;
  selected?: MuscleGroup | null;
  onSelect?: (muscle: MuscleGroup) => void;
  label: string;
}

/**
 * Fill opacity for a load value. Never fully transparent for a trained
 * muscle and never fully opaque, so the shape stays visible against both
 * themes and a heavily-loaded group does not turn into a solid blob.
 */
function fillOpacity(value: number): number {
  return value <= 0 ? 0 : 0.15 + value * 0.7;
}

export function BodyMap({ view, values, selected, onSelect, label }: BodyMapProps) {
  const paths = view === 'front' ? FRONT : BACK;

  return (
    <svg viewBox="0 0 100 220" className="h-full w-full" role="img" aria-label={label}>
      <path d={SILHOUETTE} className="fill-surface-2 stroke-border" strokeWidth={1} />

      {(Object.entries(paths) as [MuscleGroup, string][]).map(([muscle, d]) => {
        const value = values[muscle] ?? 0;
        const isSelected = selected === muscle;
        return (
          <path
            key={muscle}
            d={d}
            onClick={onSelect ? () => onSelect(muscle) : undefined}
            className={`text-accent ${onSelect ? 'cursor-pointer' : ''}`}
            fill="currentColor"
            fillOpacity={fillOpacity(value)}
            // The outline is what makes an untrained muscle findable at all —
            // with fill alone, a zero-load group would be invisible and
            // untappable. It also carries the selection state, so the map
            // does not rely on colour alone (§ 11.3).
            stroke="currentColor"
            strokeOpacity={isSelected ? 1 : 0.35}
            strokeWidth={isSelected ? 2 : 0.75}
          />
        );
      })}
    </svg>
  );
}
