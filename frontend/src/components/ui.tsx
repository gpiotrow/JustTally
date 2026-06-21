import type { ReactNode } from 'react';
import type { Difficulty } from '../lib/types';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-accent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-200">{title}</p>
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
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
  beginner: 'bg-emerald-500/15 text-emerald-300',
  intermediate: 'bg-amber-500/15 text-amber-300',
  advanced: 'bg-rose-500/15 text-rose-300',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  advanced: 'Profi',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`chip ${DIFFICULTY_STYLES[difficulty]}`}>{DIFFICULTY_LABEL[difficulty]}</span>;
}

export function CategoryBadge({ category }: { category: string }) {
  return <span className="chip bg-ink-700 text-slate-300 capitalize">{category}</span>;
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-2xl bg-ink-800 p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="btn-ghost px-2.5 py-1.5" aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
