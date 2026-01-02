// ============================================
// PASSWORD CHANGE COMPONENT (First Login)
// Copy to: src/components/auth/ChangePassword.jsx
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';

function ChangePassword({ onSuccess }) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState('');
  const navigate = useNavigate();

  const checkPasswordStrength = (password) => {
    if (password.length === 0) {
      setPasswordStrength('');
      return;
    }
    if (password.length < 8) {
      setPasswordStrength('weak');
      return;
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const strength = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (strength < 2) {
      setPasswordStrength('weak');
    } else if (strength < 4) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('strong');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (formData.newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (formData.currentPassword === formData.newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      if (response.success) {
        // Clear form
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });

        // Show success message
        alert('Password changed successfully! You can now access the system.');

        // Call success callback or redirect
        if (onSuccess) {
          onSuccess();
        } else {
          // Reload to get new token
          window.location.reload();
        }
      } else {
        setError(response.message || 'Failed to change password');
      }
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'weak':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'strong':
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Change Your Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            You must change your password before accessing the system
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                Current Password (Temporary Password)
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                value={formData.currentPassword}
                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter temporary password"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                New Password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                value={formData.newPassword}
                onChange={(e) => {
                  setFormData({ ...formData, newPassword: e.target.value });
                  checkPasswordStrength(e.target.value);
                }}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter new password (min 8 characters)"
              />
              {formData.newPassword && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getPasswordStrengthColor()}`}
                        style={{
                          width:
                            passwordStrength === 'weak'
                              ? '33%'
                              : passwordStrength === 'medium'
                              ? '66%'
                              : passwordStrength === 'strong'
                              ? '100%'
                              : '0%',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 capitalize">
                      {passwordStrength || 'Enter password'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Use uppercase, lowercase, numbers, and special characters for a strong password
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Confirm new password"
              />
              {formData.confirmPassword &&
                formData.newPassword !== formData.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Changing Password...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;


