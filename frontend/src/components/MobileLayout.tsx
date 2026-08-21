import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useOnline } from '../hooks/useOnline';
import { ThemeToggle } from './ThemeToggle';
import { RestTimerBar } from './RestTimerBar';
import { useT, type TKey } from '../i18n';
import {
  DumbbellIcon,
  ClipboardIcon,
  CalendarIcon,
  TrendingIcon,
  SettingsIcon,
  BodyIcon,
} from './icons';

const NAV: { to: string; labelKey: TKey; Icon: typeof DumbbellIcon; end: boolean }[] = [
  { to: '/', labelKey: 'nav.exercises', Icon: DumbbellIcon, end: true },
  { to: '/workout', labelKey: 'nav.workout', Icon: ClipboardIcon, end: false },
  { to: '/routines', labelKey: 'nav.routines', Icon: CalendarIcon, end: false },
  { to: '/history', labelKey: 'nav.history', Icon: TrendingIcon, end: false },
  { to: '/recovery', labelKey: 'nav.recovery', Icon: BodyIcon, end: false },
];

export function MobileLayout() {
  const online = useOnline();
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Language, account and admin access live on the Settings page now —
          set once, not per screen, they don't earn a permanent spot in the
          one row every screen shows. Marque, offline status, theme (it
          tracks the room you're lifting in) and the settings entry point
          are what's left, and that's what keeps every target here at a
          real 44px on a 320px phone instead of six controls fighting for
          the same row. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight">
            Just<span className="text-accent">Tally</span>
          </span>
          {!online && (
            <span
              className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              title={t('common.offline')}
            >
              ● {t('common.offline')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost min-w-11 p-2"
            aria-label={t('settings.open')}
            title={t('settings.open')}
          >
            <SettingsIcon width={18} height={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      {/* Layout-level, not page-level: a rest keeps running while you look up
          the next exercise, and it has to stay visible when you do. */}
      <RestTimerBar />

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-border bg-bg/95 backdrop-blur">
        {/* Literal class, not computed from NAV.length — Tailwind only emits
            classes it can find as complete strings in the source. */}
        <div className="grid grid-cols-5">
          {NAV.map(({ to, labelKey, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  isActive ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" />
                  )}
                  <Icon width={20} height={20} />
                  {t(labelKey)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
