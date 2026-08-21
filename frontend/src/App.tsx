import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { RestTimerProvider } from './hooks/useRestTimer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MobileLayout } from './components/MobileLayout';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ExerciseList } from './pages/mobile/ExerciseList';
import { ExerciseDetail } from './pages/mobile/ExerciseDetail';
import { ExerciseStats } from './pages/mobile/ExerciseStats';
import { Workout } from './pages/mobile/Workout';
import { Routines } from './pages/mobile/Routines';
import { History } from './pages/mobile/History';
import { Recovery } from './pages/mobile/Recovery';
import { Settings } from './pages/mobile/Settings';
import { Spinner } from './components/ui';
import { useT } from './i18n';

// The desktop planner and the admin web interface are never opened by the
// lifter-on-a-phone flow every other route serves — splitting them out keeps
// them out of the bundle everyone downloads to log a set.
const PlanLayout = lazy(() => import('./components/PlanLayout').then((m) => ({ default: m.PlanLayout })));
const Plan = lazy(() => import('./pages/plan/Plan').then((m) => ({ default: m.Plan })));
const AdminLayout = lazy(() => import('./components/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const ExerciseManager = lazy(() =>
  import('./pages/admin/ExerciseManager').then((m) => ({ default: m.ExerciseManager }))
);
const UserManagement = lazy(() =>
  import('./pages/admin/UserManagement').then((m) => ({ default: m.UserManagement }))
);

function RouteFallback() {
  const t = useT();
  return <Spinner label={t('common.loading')} />;
}

export default function App() {
  return (
    <AuthProvider>
      {/* Outside the router: a rest keeps counting across navigation. */}
      <RestTimerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Mobile app (any authenticated user) */}
            <Route
              element={
                <ProtectedRoute>
                  <MobileLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<ExerciseList />} />
              <Route path="/exercise/:id" element={<ExerciseDetail />} />
              <Route path="/exercise/:id/stats" element={<ExerciseStats />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/workout/:id" element={<Workout />} />
              <Route path="/routines" element={<Routines />} />
              <Route path="/history" element={<History />} />
              <Route path="/recovery" element={<Recovery />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Desktop planner (any authenticated user, breaks out of the mobile shell) — lazy, see the import above */}
            <Route
              element={
                <ProtectedRoute>
                  <Suspense fallback={<RouteFallback />}>
                    <PlanLayout />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              <Route
                path="/plan"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <Plan />
                  </Suspense>
                }
              />
            </Route>

            {/* Admin web interface (admin only) — lazy, see the import above */}
            <Route
              element={
                <ProtectedRoute adminOnly>
                  <Suspense fallback={<RouteFallback />}>
                    <AdminLayout />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              <Route
                path="/admin"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ExerciseManager />
                  </Suspense>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <UserManagement />
                  </Suspense>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RestTimerProvider>
    </AuthProvider>
  );
}
