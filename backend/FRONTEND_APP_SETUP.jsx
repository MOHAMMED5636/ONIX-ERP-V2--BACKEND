// ============================================
// APP SETUP EXAMPLE - How to integrate everything
// Copy relevant parts to: src/App.jsx or src/main.jsx
// ============================================

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './components/Login';
import DashboardHeader from './components/DashboardHeader';
import Dashboard from './pages/Dashboard'; // Your dashboard component

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div className="min-h-screen bg-gray-50">
                  <DashboardHeader />
                  <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    <Dashboard />
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
          
          {/* Admin Only Route Example */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="ADMIN">
                <div className="min-h-screen bg-gray-50">
                  <DashboardHeader />
                  <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    <AdminPanel />
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
          
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

