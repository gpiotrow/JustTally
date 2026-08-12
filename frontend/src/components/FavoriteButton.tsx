import { HeartIcon } from './icons';

/**
 * Heart toggle shared by the exercise list rows and the detail page.
 *
 * The filled/outline swap carries the state on its own, so it stays readable
 * without depending on the color difference alone.
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
  /**
   * Extra classes merged onto the button — lets a dense list (the exercise
   * picker) grow the tap target to the 44 px minimum without changing the
   * smaller default every other caller already uses.
   */
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-2 transition disabled:opacity-40 ${
        favorite ? 'text-rose-500 hover:text-rose-600' : 'text-fg-subtle hover:text-fg-muted'
      } ${className}`}
    >
      <HeartIcon width={20} height={20} filled={favorite} />
    </button>
  );
}
