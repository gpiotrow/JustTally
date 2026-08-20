import { useState, type ReactNode } from 'react';
import { CATEGORIES, DIFFICULTIES } from '../lib/types';
import { EQUIPMENT_ITEMS } from '../lib/equipment';
import type { PickerFilters, PickerMode } from '../lib/exercisePicker';
import type { ActiveFilterChip } from '../hooks/useExercisePicker';
import { ChevronRightIcon } from './icons';
import { useLanguage, type TKey } from '../i18n';

export interface ExerciseFilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  tab: PickerMode;
  onTabChange: (tab: PickerMode) => void;
  searching: boolean;
  filters: PickerFilters;
  onFilterChange: <K extends keyof PickerFilters>(axis: K, value: PickerFilters[K]) => void;
  onResetFilters: () => void;
  activeFilters: ActiveFilterChip[];
  filterCount: number;
  resultCount: number;
}

/**
 * Search, the "for you / muscle / all" tabs, and the category/difficulty/
 * equipment filters — as one bar, shared by the picker modal and the desktop
 * planner's catalog column.
 *
 * The filters used to be three always-visible, horizontally scrolling chip
 * rows (9 + 3 + 14 chips) that only worked in the "all" tab. That pushed the
 * actual exercise list below the fold on a phone and made "beginner dumbbell
 * exercises" impossible to ask for while searching or browsing "for you". They
 * are collapsed into one expandable panel here — folded away by default, with
 * whichever axes are set shown as removable chips right in the bar — and they
 * now narrow every tab and the search results, not just "all".
 */
export function ExerciseFilterBar({
  query,
  onQueryChange,
  tab,
  onTabChange,
  searching,
  filters,
  onFilterChange,
  onResetFilters,
  activeFilters,
  filterCount,
  resultCount,
}: ExerciseFilterBarProps) {
  const { t } = useLanguage();
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="space-y-2">
      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('exercises.searchPlaceholder')}
        aria-label={t('exercises.searchPlaceholder')}
      />
      {/* Dimmed while searching: the tab is still there, it just does not
          decide the list right now. Tapping one brings it back. */}
      <div
        className={`flex gap-1 rounded-xl bg-surface-2 p-1 transition-opacity ${
          searching ? 'opacity-60' : ''
        }`}
      >
        <TabButton active={!searching && tab === 'forYou'} onClick={() => onTabChange('forYou')}>
          {t('picker.forYou')}
        </TabButton>
        <TabButton active={!searching && tab === 'muscle'} onClick={() => onTabChange('muscle')}>
          {t('picker.muscle')}
        </TabButton>
        <TabButton active={!searching && tab === 'all'} onClick={() => onTabChange('all')}>
          {t('exercises.all')}
        </TabButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-controls="exercise-filter-panel"
          className={`chip-btn ${
            filterCount > 0 ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg'
          }`}
        >
          {t('picker.filters')}
          {filterCount > 0 && (
            <span className="rounded-full bg-bg/20 px-1.5 text-[10px] font-bold">
              {filterCount}
            </span>
          )}
          <ChevronRightIcon
            width={14}
            height={14}
            className={`transition-transform ${panelOpen ? 'rotate-90' : ''}`}
          />
        </button>
        {activeFilters.map((chip) => (
          <span key={chip.axis} className="chip flex items-center gap-1 bg-surface-2 text-fg-muted">
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={t('picker.removeFilter', { label: chip.label })}
              className="text-fg-subtle hover:text-danger"
            >
              ✕
            </button>
          </span>
        ))}
        {filterCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs font-semibold text-accent"
          >
            {t('picker.filterReset')}
          </button>
        )}
        {/* Feedback while narrowing, not just after: how many exercises are
            left before scrolling to find out — in every tab, not only "all". */}
        <span className="ml-auto shrink-0 text-xs text-fg-subtle">
          {t('exercises.resultCount', { count: resultCount })}
        </span>
      </div>

      {panelOpen && (
        <div id="exercise-filter-panel" className="max-h-[40vh] space-y-3 overflow-y-auto rounded-xl bg-surface-2 p-3">
          <FilterSection label={t('picker.filterCategory')}>
            <FilterChip
              active={filters.category === 'all'}
              onClick={() => onFilterChange('category', 'all')}
              label={t('exercises.all')}
            />
            {CATEGORIES.map((c) => (
              <FilterChip
                key={c}
                active={filters.category === c}
                onClick={() => onFilterChange('category', c)}
                label={t(`category.${c}` as TKey)}
              />
            ))}
          </FilterSection>
          <FilterSection label={t('picker.filterDifficulty')}>
            <FilterChip
              active={filters.difficulty === 'all'}
              onClick={() => onFilterChange('difficulty', 'all')}
              label={t('exercises.allDifficulties')}
            />
            {DIFFICULTIES.map((d) => (
              <FilterChip
                key={d}
                active={filters.difficulty === d}
                onClick={() => onFilterChange('difficulty', d)}
                label={t(`difficulty.${d}` as TKey)}
              />
            ))}
          </FilterSection>
          <FilterSection label={t('picker.filterEquipment')}>
            <FilterChip
              active={filters.equipment === 'all'}
              onClick={() => onFilterChange('equipment', 'all')}
              label={t('exercises.allEquipment')}
            />
            {EQUIPMENT_ITEMS.map((eq) => (
              <FilterChip
                key={eq}
                active={filters.equipment === eq}
                onClick={() => onFilterChange('equipment', eq)}
                label={t(`equipment.${eq}` as TKey)}
              />
            ))}
          </FilterSection>
        </div>
      )}
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</h4>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold transition ${
        active ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A filter chip inside the expandable panel. Same 44px/focus-ring `.chip-btn`
 * the picker's row-level controls use — the panel is not a place to fall back
 * to `.chip`'s smaller, non-tappable sizing.
 */
function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip-btn ${active ? 'bg-fg text-bg' : 'bg-surface text-fg-muted hover:text-fg'}`}
    >
      {label}
    </button>
  );
}
