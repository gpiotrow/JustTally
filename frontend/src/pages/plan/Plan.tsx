import { useEffect, useState } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useExercises } from '../../hooks/useExercises';
import { useRoutines } from '../../hooks/useRoutines';
import { Spinner } from '../../components/ui';
import { duplicateWeekWithBump } from '../../lib/periodization';
import {
  addExerciseToDay as addExerciseToDayPure,
  addAlternativeToSlot as addAlternativeToSlotPure,
  removeExerciseFromDay,
  removeAlternativeFromSlot,
  updateSlot as updateSlotPure,
  renameDay as renameDayPure,
  removeDay as removeDayPure,
  moveSlot as moveSlotPure,
} from '../../lib/planGrid';
import type { Exercise, Routine, RoutineDay, RoutineExercise, RoutineWeek } from '../../lib/types';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import { PlanCatalog } from './PlanCatalog';
import { PlanWeekGrid } from './PlanWeekGrid';
import { PlanDetailPanel } from './PlanDetailPanel';

interface SlotRef {
  dayId: string;
  index: number;
}

type DragData =
  | { type: 'catalog'; exercise: Exercise }
  | { type: 'slot'; dayId: string; index: number };

type DropData = { type: 'day'; dayId: string } | { type: 'slot'; dayId: string; index: number };

function blankDay(): RoutineDay {
  return { id: crypto.randomUUID(), name: '', exercises: [] };
}

function blankRoutine(): Routine {
  return {
    id: crypto.randomUUID(),
    name: '',
    weeks: [{ id: crypto.randomUUID(), days: [blankDay()] }],
    updatedAt: Date.now(),
  };
}

/** How long a change sits quiet before it is pushed and synced — see § 8.3: "entprellt, 2 s". */
const SAVE_DEBOUNCE_MS = 2000;

/**
 * Desktop planner: catalog on the left, the active week's days in the
 * middle, the selected exercise's targets on the right. Edits apply to a
 * local draft immediately and are pushed to the synced collection after a
 * short quiet period, rather than on every keystroke — the mobile editor
 * saves on an explicit tap; this one has no such moment, so debouncing is
 * the only thing standing between "responsive" and "one write per letter".
 */
export function Plan() {
  const { lang, t } = useLanguage();
  const { exercises, loading: exercisesLoading } = useExercises();
  const { routines, loaded, saveRoutine, sync } = useRoutines();

  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Routine | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<SlotRef | null>(null);
  const [bumpPercent, setBumpPercent] = useState('2.5');

  // Pick a routine to edit once the list is in: the one already selected, or
  // the first available. Never re-seeds from `routines` after that — a
  // background sync updating the list must not clobber an in-progress edit.
  useEffect(() => {
    if (!loaded) return;
    if (selectedRoutineId && routines.some((r) => r.id === selectedRoutineId)) return;
    setSelectedRoutineId(routines[0]?.id ?? null);
  }, [loaded, routines, selectedRoutineId]);

  useEffect(() => {
    const found = selectedRoutineId ? routines.find((r) => r.id === selectedRoutineId) : null;
    setDraft(found ?? null);
    setWeekIndex(0);
    setSelectedSlot(null);
    // Only when the selection itself changes — not on every background
    // refresh of `routines`, which would overwrite whatever is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoutineId]);

  // The "live" part of "live sync to the phone": push and sync a few seconds
  // after the last edit, without waiting for an explicit save action that
  // this surface — unlike the mobile editor — has no natural moment for.
  useEffect(() => {
    if (!draft) return;
    const id = window.setTimeout(() => {
      void saveRoutine(draft).then(() => sync().catch(() => {}));
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (!loaded || exercisesLoading) return <Spinner label={t('common.loading')} />;

  function updateDraft(fn: (routine: Routine) => Routine) {
    setDraft((prev) => (prev ? { ...fn(prev), updatedAt: Date.now() } : prev));
  }

  function updateWeekDays(days: RoutineDay[]) {
    updateDraft((routine) => ({
      ...routine,
      weeks: routine.weeks.map((w, i) => (i !== weekIndex ? w : { ...w, days })),
    }));
  }

  function currentWeek(routine: Routine): RoutineWeek {
    return routine.weeks[weekIndex];
  }

  function newRoutine() {
    const routine = blankRoutine();
    void saveRoutine(routine);
    setSelectedRoutineId(routine.id);
  }

  function addExerciseToDay(dayId: string, exercise: Exercise) {
    if (!draft) return;
    const newExercise: RoutineExercise = {
      exerciseId: exercise.id,
      exerciseRef: exercise.ref,
      exerciseName: localizedExercise(exercise, lang).name,
      alternatives: [],
      targetSets: 3,
    };
    updateWeekDays(addExerciseToDayPure(currentWeek(draft).days, dayId, newExercise));
  }

  function addAlternativeToSlot(dayId: string, index: number, exercise: Exercise) {
    if (!draft) return;
    const alternative = {
      exerciseId: exercise.id,
      exerciseRef: exercise.ref,
      exerciseName: localizedExercise(exercise, lang).name,
    };
    updateWeekDays(addAlternativeToSlotPure(currentWeek(draft).days, dayId, index, alternative));
  }

  function moveSlot(fromDayId: string, fromIndex: number, toDayId: string, toIndex: number | null) {
    if (!draft) return;
    updateWeekDays(moveSlotPure(currentWeek(draft).days, fromDayId, fromIndex, toDayId, toIndex));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as DragData | undefined;
    const overData = over.data.current as DropData | undefined;
    if (!activeData || !overData) return;

    if (activeData.type === 'catalog') {
      if (overData.type === 'day') addExerciseToDay(overData.dayId, activeData.exercise);
      else addAlternativeToSlot(overData.dayId, overData.index, activeData.exercise);
      return;
    }

    if (overData.type === 'day') moveSlot(activeData.dayId, activeData.index, overData.dayId, null);
    else moveSlot(activeData.dayId, activeData.index, overData.dayId, overData.index);
  }

  function removeExercise(dayId: string, index: number) {
    if (!draft) return;
    updateWeekDays(removeExerciseFromDay(currentWeek(draft).days, dayId, index));
    setSelectedSlot((prev) => (prev?.dayId === dayId && prev.index === index ? null : prev));
  }

  function renameDay(dayId: string, name: string) {
    if (!draft) return;
    updateWeekDays(renameDayPure(currentWeek(draft).days, dayId, name));
  }

  function removeDay(dayId: string) {
    if (!draft) return;
    updateWeekDays(removeDayPure(currentWeek(draft).days, dayId));
    setSelectedSlot((prev) => (prev?.dayId === dayId ? null : prev));
  }

  function addDay() {
    if (!draft) return;
    updateWeekDays([...currentWeek(draft).days, blankDay()]);
  }

  function addWeek() {
    updateDraft((routine) => ({
      ...routine,
      weeks: [...routine.weeks, { id: crypto.randomUUID(), days: [] }],
    }));
  }

  function duplicateCurrentWeek() {
    if (!draft) return;
    const percent = Number(bumpPercent) || 0;
    const week = duplicateWeekWithBump(currentWeek(draft), percent);
    const weeks = [...draft.weeks];
    weeks.splice(weekIndex + 1, 0, week);
    updateDraft((routine) => ({ ...routine, weeks }));
    setWeekIndex(weekIndex + 1);
  }

  function copyDay(dayId: string, targetWeekId: string) {
    if (!draft) return;
    const sourceDay = currentWeek(draft).days.find((d) => d.id === dayId);
    if (!sourceDay) return;
    const copy: RoutineDay = { ...sourceDay, id: crypto.randomUUID() };
    updateDraft((routine) => ({
      ...routine,
      weeks: routine.weeks.map((w) => (w.id !== targetWeekId ? w : { ...w, days: [...w.days, copy] })),
    }));
  }

  function updateSlot(patch: Partial<RoutineExercise>) {
    if (!draft || !selectedSlot) return;
    updateWeekDays(updateSlotPure(currentWeek(draft).days, selectedSlot.dayId, selectedSlot.index, patch));
  }

  function removeAlternative(altIndex: number) {
    if (!draft || !selectedSlot) return;
    updateWeekDays(
      removeAlternativeFromSlot(currentWeek(draft).days, selectedSlot.dayId, selectedSlot.index, altIndex)
    );
  }

  const selectedExercise =
    draft && selectedSlot
      ? currentWeek(draft).days.find((d) => d.id === selectedSlot.dayId)?.exercises[selectedSlot.index] ?? null
      : null;

  const copyTargets = draft
    ? draft.weeks
        .map((w, i) => ({ id: w.id, label: w.name || `${t('plan.week')} ${i + 1}` }))
        .filter((w) => w.id !== draft.weeks[weekIndex]?.id)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <select
          value={selectedRoutineId ?? ''}
          onChange={(e) => setSelectedRoutineId(e.target.value || null)}
          className="input w-56 py-1.5 text-sm"
        >
          {routines.length === 0 && <option value="">{t('routines.emptyTitle')}</option>}
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || t('routines.newTitle')}
            </option>
          ))}
        </select>
        <button onClick={newRoutine} className="btn-ghost px-3 py-1.5 text-sm">
          {t('routines.new')}
        </button>

        {draft && (
          <>
            <input
              value={draft.name}
              onChange={(e) => updateDraft((routine) => ({ ...routine, name: e.target.value }))}
              placeholder={t('routines.namePlaceholder')}
              className="input w-56 py-1.5 text-sm"
            />

            <div className="ml-auto flex items-center gap-1.5">
              {draft.weeks.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setWeekIndex(i);
                    setSelectedSlot(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    i === weekIndex ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {w.name || `${t('plan.week')} ${i + 1}`}
                </button>
              ))}
              <button onClick={addWeek} className="btn-ghost px-2 py-1.5 text-xs">
                + {t('plan.week')}
              </button>
              <div className="flex items-center gap-1 border-l border-border pl-2">
                <input
                  type="number"
                  step="0.5"
                  value={bumpPercent}
                  onChange={(e) => setBumpPercent(e.target.value)}
                  className="input w-16 py-1.5 text-xs"
                  aria-label={t('plan.bumpPercent')}
                />
                <button onClick={duplicateCurrentWeek} className="btn-ghost px-2 py-1.5 text-xs">
                  {t('plan.duplicateWeek')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {!draft ? (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-subtle">
          {t('routines.emptyHint')}
        </div>
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <div className="grid min-h-0 flex-1 grid-cols-[16rem,1fr,20rem]">
            <PlanCatalog exercises={exercises} />
            <PlanWeekGrid
              week={currentWeek(draft)}
              exercises={exercises}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              onRemoveExercise={removeExercise}
              onRenameDay={renameDay}
              onRemoveDay={removeDay}
              onAddDay={addDay}
              onCopyDay={copyDay}
              copyTargets={copyTargets}
            />
            <PlanDetailPanel
              exercise={selectedExercise}
              exercises={exercises}
              onChange={updateSlot}
              onRemoveAlternative={removeAlternative}
            />
          </div>
        </DndContext>
      )}
    </div>
  );
}
