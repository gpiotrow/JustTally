import { useEffect, useState, type FormEvent } from 'react';
import { listUsers, createUser, setUserRole, disableUser, enableUser } from '../../api/users';
import { useAuth } from '../../hooks/useAuth';
import type { Role, User } from '../../lib/types';
import { EmptyState, ErrorBanner, Modal, Spinner } from '../../components/ui';
import { useT } from '../../i18n';

export function UserManagement() {
  const { user: me } = useAuth();
  const t = useT();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listUsers();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changeRole(u: User, role: Role) {
    try {
      const res = await setUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.roleError'));
    }
  }

  async function disable(u: User) {
    if (!confirm(t('users.disableConfirm', { name: u.name }))) return;
    try {
      await disableUser(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, disabledAt: Date.now() } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.deleteError'));
    }
  }

  async function enable(u: User) {
    try {
      const res = await enableUser(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.enableError'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-sm text-fg-muted">{t('users.subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          {t('users.new')}
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label={t('common.loading')} />
      ) : users.length === 0 ? (
        <EmptyState title={t('users.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">{t('common.name')}</th>
                <th className="px-4 py-3">{t('common.email')}</th>
                <th className="px-4 py-3">{t('users.role')}</th>
                <th className="px-4 py-3">{t('users.status')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {users.map((u) => {
                const isDisabled = Boolean(u.disabledAt);
                return (
                  <tr key={u.id} className={`hover:bg-surface-2/50 ${isDisabled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium text-fg">
                      {u.name}
                      {u.id === me?.id && <span className="ml-2 text-xs text-fg-subtle">{t('users.you')}</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        className="input w-auto py-1.5 text-xs"
                        value={u.role}
                        disabled={u.id === me?.id}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          isDisabled ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                        }`}
                      >
                        {isDisabled ? t('users.statusDisabled') : t('users.statusActive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isDisabled ? (
                        <button onClick={() => enable(u)} className="btn-secondary px-3 py-1.5 text-xs">
                          {t('users.enable')}
                        </button>
                      ) : (
                        <button
                          onClick={() => disable(u)}
                          className="btn-danger px-3 py-1.5 text-xs"
                          disabled={u.id === me?.id}
                        >
                          {t('users.disable')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(u) => {
            setUsers((prev) => [...prev, u]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await createUser({ name: name.trim(), email: email.trim(), password, role });
      onCreated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.createError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('users.newTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label">{t('common.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">{t('common.email')}</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">{t('register.passwordLabel')}</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="label">{t('users.role')}</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('users.creating') : t('users.create')}
        </button>
      </form>
    </Modal>
  );
}
