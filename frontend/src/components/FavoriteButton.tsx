import { HeartIcon } from './icons';

/**
 * Heart toggle shared by the exercise list rows and the detail page.
 *
 * The filled/outline swap carries the state on its own, so it stays readable
 * without depending on the color difference alone. The 44px minimum is the
 * default, not an opt-in — every caller gets a real touch target without
 * having to remember to ask for one.
 */
export function FavoriteButton({
  favorite,
  disabled,
  label,
  title,
  onClick,
  className = '',
}: {
  favorite: boolean;
  disabled: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  /** Extra classes merged onto the button, for callers that need more than the 44px default (e.g. a denser hit area). */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={favorite}
      aria-label={label}
      title={title ?? label}
      className={`focus-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
        favorite ? 'text-rose-500 hover:text-rose-600' : 'text-fg-subtle hover:text-fg-muted'
      } ${className}`}
    >
      <HeartIcon width={20} height={20} filled={favorite} />
    </button>
  );
}
