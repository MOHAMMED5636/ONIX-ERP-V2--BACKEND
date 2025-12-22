// ============================================
// COPY THIS TO YOUR FRONTEND PROJECT
// Location: src/components/Login.jsx or src/pages/Login.jsx
// ============================================

import { useState } from 'react';
import { login } from '../services/api'; // Adjust path to your API service

function LoginPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'ADMIN',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(
        formData.email,
        formData.password,
        formData.role
      );

      if (response.success) {
        // Redirect to dashboard or home page
        window.location.href = '/dashboard';
        // OR if using React Router:
        // navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Login to ONIX ERP
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="admin@onixgroup.ae"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter password"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="ADMIN">Admin</option>
                <option value="TENDER_ENGINEER">Tender Engineer</option>
                <option value="PROJECT_MANAGER">Project Manager</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Sign in'}
            </button>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <p className="text-xs font-semibold text-gray-700 mb-2">Test Credentials:</p>
            <p className="text-xs text-gray-600">
              <strong>Admin:</strong> admin@onixgroup.ae / admin123
            </p>
            <p className="text-xs text-gray-600">
              <strong>Engineer:</strong> engineer@onixgroup.ae / engineer@123
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;




