import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/admin', label: 'Übungen', end: true },
  { to: '/admin/users', label: 'Benutzer', end: false },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-xl font-extrabold tracking-tight">
              Just<span className="text-accent">Tally</span>
              <span className="ml-2 text-xs font-medium uppercase tracking-widest text-fg-subtle">
                Admin
              </span>
            </span>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-surface-2 text-fg'
                        : 'text-fg-muted hover:text-fg'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button onClick={() => navigate('/')} className="btn-ghost px-3 py-1.5 text-xs">
              Mobile Ansicht
            </button>
            <span className="hidden text-sm text-fg-muted sm:inline">{user?.name}</span>
            <button onClick={logout} className="btn-ghost px-3 py-1.5 text-xs">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
