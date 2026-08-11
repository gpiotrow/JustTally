import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api, getToken, setToken } from '../api/client';
import type { Sex, User } from '../lib/types';
import { isUnit, type Unit } from '../lib/units';

/**
 * Last identity the server confirmed. Kept so an offline start can restore the
 * session instead of dropping the user on the login screen — where, with no
 * network, they could not get back in.
 *
 * Not a trust boundary: it decides which screens render, never what the API
 * allows. Every request is still authorized server-side against the token.
 */
const USER_KEY = 'jt_user';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export interface ProfileUpdate {
  unitPreference?: Unit;
  sex?: Sex | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** Display unit for weights; `kg` until the server says otherwise. */
  unit: Unit;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  token: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from stored token on mount.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Start from the last confirmed identity so an offline launch opens the
    // app; the check below corrects or clears it once the server answers.
    const cached = readCachedUser();
    if (cached) setUser(cached);

    api<{ user: User }>('/auth/me')
      .then((res) => {
        setUser(res.user);
        cacheUser(res.user);
      })
      .catch((err) => {
        // Only the server rejecting the token proves it is invalid. A request
        // that never arrived says nothing about the token — and discarding it
        // there would lock the user out of the entire offline app, including
        // any way back in, until they find a network. Which is precisely when
        // an offline-first gym app is supposed to be useful.
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          cacheUser(null);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', { body: { email, password } });
    setToken(res.token);
    setUser(res.user);
    cacheUser(res.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/register', { body: { name, email, password } });
    setToken(res.token);
    setUser(res.user);
    cacheUser(res.user);
  }, []);

  /**
   * Writes the preference through to the server and caches the confirmed
   * result, so the next offline start opens with the unit the user chose
   * rather than falling back to kg and silently rescaling every number.
   */
  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    const res = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: update });
    setUser(res.user);
    cacheUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    cacheUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      // Guarded rather than trusted: the cached user is JSON from localStorage,
      // and an unrecognised unit would otherwise reach the conversion helpers.
      unit: isUnit(user?.unitPreference) ? user.unitPreference : 'kg',
      login,
      register,
      updateProfile,
      logout,
    }),
    [user, loading, login, register, updateProfile, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
