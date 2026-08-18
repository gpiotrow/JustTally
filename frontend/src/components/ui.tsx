import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Difficulty } from '../lib/types';
import { useT, type TKey } from '../i18n';
import { CATEGORIES } from '../lib/types';
import type { TrackingMode } from '../lib/tracking';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-fg-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-semibold text-fg">{title}</p>
      {hint && <p className="text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  );
}

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  advanced: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const t = useT();
  return (
    <span className={`chip ${DIFFICULTY_STYLES[difficulty]}`}>
      {t(`difficulty.${difficulty}` as TKey)}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const t = useT();
  // Known categories get a localized label; unknown ones fall back to the raw value.
  const label = CATEGORY_SET.has(category) ? t(`category.${category}` as TKey) : category;
  return <span className="chip bg-surface-2 text-fg-muted capitalize">{label}</span>;
}

/**
 * Only rendered for a non-default mode — 'reps_weight' is what the vast
 * majority of exercises use, and a badge on every single one would be noise
 * rather than information.
 */
export function TrackingBadge({ tracking }: { tracking: TrackingMode }) {
  const t = useT();
  if (tracking === 'reps_weight') return null;
  return <span className="chip bg-surface-2 text-fg-muted">{t(`tracking.${tracking}` as TKey)}</span>;
}

/**
 * "N changes waiting to sync" — shown wherever that anxiety can come up
 * (History's sync row, the Workout screen itself). One component instead of
 * the same amber pairing copy-pasted at each call site.
 */
export function PendingSyncChip({ count }: { count: number }) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      {t('history.pending', { count })}
    </span>
  );
}

/**
 * Bottom sheet on a phone, centred dialog from `sm` up.
 *
 * The panel is a flex column so that only the body scrolls: a search field that
 * scrolls out of reach, or a "3 hinzufügen" button that has to be scrolled back
 * to, would defeat the point of having them. `toolbar` and `footer` are both
 * optional and additive — a modal that passes neither is a title plus a
 * scrolling body, which is what every existing caller already gets.
 */
export function Modal({
  title,
  children,
  onClose,
  toolbar,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Stays put under the title — search fields, filters, mode switches. */
  toolbar?: ReactNode;
  /** Stays put at the bottom — the one action that commits the dialog. */
  footer?: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Captured during render, before any child mounts — an input inside the
  // panel with its own `autoFocus` claims focus during commit, which happens
  // before this component's effects run, so reading `activeElement` in an
  // effect would already see that child instead of whatever really opened
  // the dialog.
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
  );

  // Focus lands in the dialog on open and returns to whatever opened it on
  // close — a screen reader user is otherwise left wherever they tapped,
  // with no indication a dialog is even up. But a child that already claimed
  // focus via its own `autoFocus` (the plate calculator's weight field, for
  // one) keeps it — the dialog frame is only the fallback when nothing
  // inside asked for focus itself.
  useEffect(() => {
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }
    return () => openerRef.current?.focus?.();
  }, []);

  // Escape closes, and Tab is trapped inside the panel — without this a
  // keyboard user can tab straight through into the page behind the overlay.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card flex max-h-[90vh] w-full max-w-lg flex-col rounded-b-none rounded-t-2xl p-5 outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-fg">
            {title}
          </h2>
          <button onClick={onClose} className="btn-ghost px-2.5 py-1.5" aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {toolbar && <div className="mb-3 shrink-0">{toolbar}</div>}
        {/* `min-h-0` is what actually lets this shrink inside the flex column —
            without it the body keeps its content height and the panel overflows. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
