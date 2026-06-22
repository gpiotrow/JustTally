import type { ReactNode } from 'react';
import type { Difficulty } from '../lib/types';
import { useT, type TKey } from '../i18n';
import { CATEGORIES } from '../lib/types';

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
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
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

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">{title}</h2>
          <button onClick={onClose} className="btn-ghost px-2.5 py-1.5" aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
