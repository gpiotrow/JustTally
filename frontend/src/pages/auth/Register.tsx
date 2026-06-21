import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ErrorBanner } from '../../components/ui';
import { AuthShell } from './Login';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle="Erstelle ein Konto, um loszulegen.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Passwort (min. 6 Zeichen)</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Registrieren…' : 'Registrieren'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        Bereits ein Konto?{' '}
        <Link to="/login" className="font-semibold text-accent">
          Anmelden
        </Link>
      </p>
    </AuthShell>
  );
}
