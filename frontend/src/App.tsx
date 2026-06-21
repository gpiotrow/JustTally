import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MobileLayout } from './components/MobileLayout';
import { AdminLayout } from './components/AdminLayout';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ExerciseList } from './pages/mobile/ExerciseList';
import { ExerciseDetail } from './pages/mobile/ExerciseDetail';
import { Workout } from './pages/mobile/Workout';
import { History } from './pages/mobile/History';
import { ExerciseManager } from './pages/admin/ExerciseManager';
import { UserManagement } from './pages/admin/UserManagement';

export default function App() {
  return (
    <AuthProvider>
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
            <Route path="/workout" element={<Workout />} />
            <Route path="/history" element={<History />} />
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
    </AuthProvider>
  );
}
