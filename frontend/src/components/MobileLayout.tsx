import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useOnline';
import { ThemeToggle } from './ThemeToggle';
import { DumbbellIcon, ClipboardIcon, TrendingIcon } from './icons';

const NAV = [
  { to: '/', label: 'Übungen', Icon: DumbbellIcon, end: true },
  { to: '/workout', label: 'Training', Icon: ClipboardIcon, end: false },
  { to: '/history', label: 'Verlauf', Icon: TrendingIcon, end: false },
];

export function MobileLayout() {
  const { user, isAdmin, logout } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight">
            Just<span className="text-accent">Tally</span>
          </span>
          {!online && (
            <span
              className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              title="Offline-Modus"
            >
              ● Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className="btn-ghost px-3 py-1.5 text-xs">
              Admin
            </button>
          )}
          <button onClick={logout} className="btn-ghost px-3 py-1.5 text-xs" title={user?.email}>
            Abmelden
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-border bg-bg/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {NAV.map(({ to, label, Icon, end }) => (
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
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
