import { useEffect, useState, type FormEvent } from 'react';
import { listUsers, createUser, setUserRole, deleteUser } from '../../api/users';
import { useAuth } from '../../hooks/useAuth';
import type { Role, User } from '../../lib/types';
import { EmptyState, ErrorBanner, Modal, Spinner } from '../../components/ui';

export function UserManagement() {
  const { user: me } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
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
      setError(err instanceof Error ? err.message : 'Rolle ändern fehlgeschlagen');
    }
  }

  async function remove(u: User) {
    if (!confirm(`Benutzer "${u.name}" löschen?`)) return;
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Benutzer</h1>
          <p className="text-sm text-slate-400">Verwalte Konten und Rollen.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          + Benutzer
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label="Laden…" />
      ) : users.length === 0 ? (
        <EmptyState title="Keine Benutzer" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Rolle</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-ink-800/50">
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-xs text-slate-500">(du)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(u)}
                      className="btn-danger px-3 py-1.5 text-xs"
                      disabled={u.id === me?.id}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
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
      setError(err instanceof Error ? err.message : 'Erstellen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Neuer Benutzer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">E-Mail</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Passwort</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div>
          <label className="label">Rolle</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Erstellen…' : 'Erstellen'}
        </button>
      </form>
    </Modal>
  );
}
