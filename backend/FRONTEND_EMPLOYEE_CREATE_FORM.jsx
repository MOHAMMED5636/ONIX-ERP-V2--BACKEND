// ============================================
// EMPLOYEE CREATION FORM
// Copy to: src/components/employees/CreateEmployeeForm.jsx
// ============================================

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';

function CreateEmployeeForm({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE',
    phone: '',
    department: '',
    position: '',
    employeeId: '',
    projectIds: [],
  });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [showCredentials, setShowCredentials] = useState(false);

  // Fetch available projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await apiRequest('/projects');
        if (response.success && response.data) {
          setProjects(response.data.projects || []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      }
    };
    fetchProjects();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiRequest('/employees', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      if (response.success) {
        // Show credentials modal
        setCredentials({
          email: response.data.credentials.email,
          password: response.data.credentials.temporaryPassword,
        });
        setShowCredentials(true);
        
        // Call success callback
        if (onSuccess) {
          onSuccess(response.data.employee);
        }
      } else {
        setError(response.message || 'Failed to create employee');
      }
    } catch (err) {
      setError(err.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCredentials = () => {
    setShowCredentials(false);
    setCredentials(null);
    // Reset form
    setFormData({
      firstName: '',
      lastName: '',
      role: 'EMPLOYEE',
      phone: '',
      department: '',
      position: '',
      employeeId: '',
      projectIds: [],
    });
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Employee</h2>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="John"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role *
              </label>
              <select
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="PROJECT_MANAGER">Project Manager</option>
                <option value="TENDER_ENGINEER">Tender Engineer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee ID
              </label>
              <input
                type="text"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="EMP-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="+971-50-123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Engineering"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position
            </label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Senior Engineer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign to Projects (Optional)
            </label>
            <select
              multiple
              value={formData.projectIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setFormData({ ...formData, projectIds: selected });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.referenceNumber} - {project.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Hold Ctrl/Cmd to select multiple projects
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>

      {/* Credentials Modal */}
      {showCredentials && credentials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Employee Credentials
            </h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <p className="text-sm text-yellow-800 font-semibold mb-2">
                ⚠️ Important: Save these credentials now!
              </p>
              <p className="text-xs text-yellow-700">
                These credentials will not be shown again. The employee will be required to change their password on first login.
              </p>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (Username)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={credentials.email}
                    className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-md font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(credentials.email);
                      alert('Email copied to clipboard!');
                    }}
                    className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temporary Password
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={credentials.password}
                    className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-md font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(credentials.password);
                      alert('Password copied to clipboard!');
                    }}
                    className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleCloseCredentials}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              I've Saved the Credentials
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default CreateEmployeeForm;

