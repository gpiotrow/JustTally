import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ErrorBanner } from '../../components/ui';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';
import { useT } from '../../i18n';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle={t('login.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label" htmlFor="email">{t('common.email')}</label>
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
          <label className="label" htmlFor="password">{t('common.password')}</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-fg-muted">
        {t('login.noAccount')}{' '}
        <Link to="/register" className="font-semibold text-accent">
          {t('login.register')}
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Just<span className="text-accent">Tally</span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>
      </div>
      <div className="card p-6">{children}</div>
    </div>
  );
}
