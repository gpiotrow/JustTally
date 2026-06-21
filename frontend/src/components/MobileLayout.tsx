import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useOnline';

const NAV = [
  { to: '/', label: 'Übungen', icon: '🏋️', end: true },
  { to: '/workout', label: 'Training', icon: '📋', end: false },
  { to: '/history', label: 'Verlauf', icon: '📈', end: false },
];

export function MobileLayout() {
  const { user, isAdmin, logout } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-700 bg-ink-900/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight">
            Just<span className="text-accent">Tally</span>
          </span>
          {!online && (
            <span className="chip bg-amber-500/15 text-amber-300" title="Offline-Modus">
              ● Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-ink-700 bg-ink-900/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition ${
                  isActive ? 'text-accent' : 'text-slate-400'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
