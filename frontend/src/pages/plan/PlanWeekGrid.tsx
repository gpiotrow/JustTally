import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { RoutineDay, RoutineWeek } from '../../lib/types';
import { useT } from '../../i18n';

interface SlotRef {
  dayId: string;
  index: number;
}

function ExerciseSlot({
  day,
  index,
  selected,
  onSelect,
  onRemove,
}: {
  day: RoutineDay;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const exercise = day.exercises[index];
  const dragId = `slot-${day.id}-${index}`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragId,
    data: { type: 'slot', dayId: day.id, index },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${dragId}-drop`,
    data: { type: 'slot', dayId: day.id, index },
  });

  return (
    <li
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`cursor-grab rounded-lg border px-2.5 py-2 text-sm transition active:cursor-grabbing ${
        selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2 hover:bg-border'
      } ${isDragging ? 'opacity-40' : ''} ${isOver ? 'ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-fg">{exercise.exerciseName}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 text-xs text-fg-subtle hover:text-danger"
        >
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-xs text-fg-subtle">
        {exercise.targetSets}× {exercise.targetReps ?? '–'}
        {exercise.alternatives.length > 0 ? ` · +${exercise.alternatives.length}` : ''}
      </p>
    </li>
  );
}

function DayColumn({
  day,
  selectedSlot,
  onSelectSlot,
  onRemoveExercise,
  onRenameDay,
  onRemoveDay,
  onCopyDay,
  copyTargets,
}: {
  day: RoutineDay;
  selectedSlot: SlotRef | null;
  onSelectSlot: (slot: SlotRef) => void;
  onRemoveExercise: (index: number) => void;
  onRenameDay: (name: string) => void;
  onRemoveDay: () => void;
  onCopyDay: (targetWeekId: string) => void;
  copyTargets: { id: string; label: string }[];
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day.id}`, data: { type: 'day', dayId: day.id } });

  return (
    <div className={`flex w-64 shrink-0 flex-col rounded-xl border border-border ${isOver ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <input
          value={day.name}
          onChange={(e) => onRenameDay(e.target.value)}
          placeholder={t('routines.dayNamePlaceholder')}
          className="input flex-1 py-1 text-sm"
        />
        {copyTargets.length > 0 && (
          <select
            aria-label={t('plan.copyDayTo')}
            onChange={(e) => {
              if (e.target.value) onCopyDay(e.target.value);
              e.target.value = '';
            }}
            defaultValue=""
            className="input w-8 shrink-0 py-1 text-xs"
            title={t('plan.copyDayTo')}
          >
            <option value="" disabled>
              ⧉
            </option>
            {copyTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        )}
        <button onClick={onRemoveDay} className="btn-ghost px-2 py-1 text-xs text-danger">
          ✕
        </button>
      </div>
      <ul ref={setNodeRef} className="min-h-24 flex-1 space-y-1.5 p-2">
        {day.exercises.map((_, index) => (
          <ExerciseSlot
            key={index}
            day={day}
            index={index}
            selected={selectedSlot?.dayId === day.id && selectedSlot.index === index}
            onSelect={() => onSelectSlot({ dayId: day.id, index })}
            onRemove={() => onRemoveExercise(index)}
          />
        ))}
        {day.exercises.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-fg-subtle">
            {t('plan.dropHere')}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Middle column: one horizontally scrollable row of day columns for the active week. */
export function PlanWeekGrid({
  week,
  selectedSlot,
  onSelectSlot,
  onRemoveExercise,
  onRenameDay,
  onRemoveDay,
  onAddDay,
  onCopyDay,
  copyTargets,
}: {
  week: RoutineWeek;
  selectedSlot: SlotRef | null;
  onSelectSlot: (slot: SlotRef) => void;
  onRemoveExercise: (dayId: string, index: number) => void;
  onRenameDay: (dayId: string, name: string) => void;
  onRemoveDay: (dayId: string) => void;
  onAddDay: () => void;
  onCopyDay: (dayId: string, targetWeekId: string) => void;
  copyTargets: { id: string; label: string }[];
}) {
  const t = useT();
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {week.days.map((day) => (
        <DayColumn
          key={day.id}
          day={day}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          onRemoveExercise={(index) => onRemoveExercise(day.id, index)}
          onRenameDay={(name) => onRenameDay(day.id, name)}
          onRemoveDay={() => onRemoveDay(day.id)}
          onCopyDay={(targetWeekId) => onCopyDay(day.id, targetWeekId)}
          copyTargets={copyTargets}
        />
      ))}
      <button
        onClick={onAddDay}
        className="btn-ghost h-fit w-40 shrink-0 rounded-xl border border-dashed border-border py-3 text-sm"
      >
        {t('routines.addDay')}
      </button>
    </div>
  );
}
