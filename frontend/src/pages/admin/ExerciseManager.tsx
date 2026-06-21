import { useEffect, useState } from 'react';
import { listExercises, deleteExercise } from '../../api/exercises';
import type { Exercise } from '../../lib/types';
import { CategoryBadge, DifficultyBadge, EmptyState, ErrorBanner, Modal, Spinner } from '../../components/ui';
import { ExerciseForm } from './ExerciseForm';

export function ExerciseManager() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | null | undefined>(undefined); // undefined = closed

  async function load() {
    setLoading(true);
    try {
      const res = await listExercises();
      setExercises(res.exercises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(saved: Exercise) {
    setExercises((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      const next = exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleDelete(ex: Exercise) {
    if (!confirm(`"${ex.name}" wirklich löschen? Medien werden ebenfalls entfernt.`)) return;
    try {
      await deleteExercise(ex.id);
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Übungen verwalten</h1>
          <p className="text-sm text-fg-muted">
            Erstelle und pflege Übungen mit Anleitung, Fotos und Videos.
          </p>
        </div>
        <button onClick={() => setEditing(null)} className="btn-primary">
          + Neue Übung
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label="Laden…" />
      ) : exercises.length === 0 ? (
        <EmptyState title="Noch keine Übungen" hint="Lege deine erste Übung an." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Kategorie</th>
                <th className="px-4 py-3">Schwierigkeit</th>
                <th className="px-4 py-3">Medien</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {exercises.map((ex) => (
                <tr key={ex.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">{ex.name}</td>
                  <td className="px-4 py-3"><CategoryBadge category={ex.category} /></td>
                  <td className="px-4 py-3"><DifficultyBadge difficulty={ex.difficulty} /></td>
                  <td className="px-4 py-3 text-fg-muted">{ex.media.length}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(ex)} className="btn-ghost px-3 py-1.5 text-xs">
                        Bearbeiten
                      </button>
                      <button onClick={() => handleDelete(ex)} className="btn-danger px-3 py-1.5 text-xs">
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <Modal
          title={editing ? 'Übung bearbeiten' : 'Neue Übung'}
          onClose={() => setEditing(undefined)}
        >
          <ExerciseForm initial={editing} onSaved={handleSaved} />
        </Modal>
      )}
    </div>
  );
}
