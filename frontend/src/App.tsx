import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { RestTimerProvider } from './hooks/useRestTimer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MobileLayout } from './components/MobileLayout';
import { PlanLayout } from './components/PlanLayout';
import { AdminLayout } from './components/AdminLayout';
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
import { Plan } from './pages/plan/Plan';
import { ExerciseManager } from './pages/admin/ExerciseManager';
import { UserManagement } from './pages/admin/UserManagement';

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

            {/* Desktop planner (any authenticated user, breaks out of the mobile shell) */}
            <Route
              element={
                <ProtectedRoute>
                  <PlanLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/plan" element={<Plan />} />
            </Route>

            {/* Admin web interface (admin only) */}
            <Route
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin" element={<ExerciseManager />} />
              <Route path="/admin/users" element={<UserManagement />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RestTimerProvider>
    </AuthProvider>
  );
}
