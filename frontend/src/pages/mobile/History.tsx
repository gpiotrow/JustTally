import { useWorkouts } from '../../hooks/useWorkouts';
import { EmptyState, Spinner } from '../../components/ui';

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function History() {
  const { sessions, loaded, deleteSession } = useWorkouts();

  if (!loaded) return <Spinner label="Laden…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Verlauf</h1>

      {sessions.length === 0 ? (
        <EmptyState
          title="Noch keine Trainings"
          hint="Deine gespeicherten Trainings erscheinen hier — nur auf diesem Gerät."
        />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const totalSets = s.entries.reduce((sum, e) => sum + e.sets.length, 0);
            return (
              <li key={s.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-200">{dateFmt.format(s.date)}</p>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    Löschen
                  </button>
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  {s.entries.length} Übungen · {totalSets} Sätze
                </p>
                <ul className="space-y-1.5">
                  {s.entries.map((e, i) => (
                    <li key={i} className="text-sm text-slate-300">
                      <span className="font-medium">{e.exerciseName}</span>{' '}
                      <span className="text-slate-500">
                        {e.sets
                          .map((set) => `${set.reps}${set.weight ? `×${set.weight}kg` : ''}`)
                          .join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
