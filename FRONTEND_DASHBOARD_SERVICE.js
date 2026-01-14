// ============================================
// DASHBOARD API SERVICE
// Copy to: ERP-FRONTEND/src/services/dashboardAPI.js
// ============================================

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';

/**
 * Get Dashboard Statistics
 * Returns real-time counts of active projects, tasks, and other metrics
 * @returns {Promise<Object>} Dashboard stats
 */
export const getDashboardStats = async () => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard stats');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Dashboard stats error:', error);
    throw error;
  }
};

/**
 * Get Dashboard Summary
 * Returns simplified dashboard statistics
 * @returns {Promise<Object>} Dashboard summary
 */
export const getDashboardSummary = async () => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard summary');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Dashboard summary error:', error);
    throw error;
  }
};

/**
 * Get Dashboard Projects
 * @param {Object} filters - Optional filters (status, limit, etc.)
 * @returns {Promise<Object>} Projects data
 */
export const getDashboardProjects = async (filters = {}) => {
  try {
    const token = localStorage.getItem('token');
    const queryParams = new URLSearchParams(filters).toString();
    
    const response = await fetch(`${API_BASE_URL}/dashboard/projects?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard projects');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Dashboard projects error:', error);
    throw error;
  }
};

/**
 * Get Dashboard Tasks
 * @returns {Promise<Object>} Tasks data
 */
export const getDashboardTasks = async () => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/dashboard/tasks`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard tasks');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Dashboard tasks error:', error);
    throw error;
  }
};

export default {
  getDashboardStats,
  getDashboardSummary,
  getDashboardProjects,
  getDashboardTasks,
};


