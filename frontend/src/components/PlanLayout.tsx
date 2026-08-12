import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useT } from '../i18n';

/**
 * Breaks out of the mobile `max-w-md` corset: the planner needs three
 * columns side by side (catalog, week/day grid, detail panel), which does
 * not fit a phone screen and is not meant to — this route is desktop-only
 * by content, not by a device check.
 */
export function PlanLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-bg/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold tracking-tight">
            Just<span className="text-accent">Tally</span>
          </span>
          <span className="text-xs font-medium uppercase tracking-widest text-fg-subtle">
            {t('plan.title')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <button onClick={() => navigate('/routines')} className="btn-ghost px-3 py-1.5 text-xs">
            {t('layout.mobileView')}
          </button>
          <span className="hidden text-sm text-fg-muted sm:inline">{user?.name}</span>
          <button onClick={logout} className="btn-ghost px-3 py-1.5 text-xs">
            {t('common.logout')}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
