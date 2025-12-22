// ============================================
// COPY THIS FILE TO YOUR FRONTEND PROJECT
// Location: src/services/api.js or src/utils/api.js
// ============================================

const API_BASE_URL = 'http://localhost:3001/api';

// ============================================
// AUTHENTICATION API FUNCTIONS
// ============================================

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} role - User role (ADMIN, TENDER_ENGINEER, PROJECT_MANAGER, CONTRACTOR)
 * @returns {Promise} Login response with token and user data
 */
export const login = async (email, password, role) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password, role }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Store token and user in localStorage
    if (data.success && data.data) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
    }

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Get current authenticated user
 * @returns {Promise} User data
 */
export const getCurrentUser = async () => {
  try {
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      // Token invalid, clear storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      throw new Error(data.message || 'Failed to get current user');
    }

    return data;
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

/**
 * Logout user (clears localStorage)
 */
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login'; // Redirect to login page
};

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};

/**
 * Get stored token
 * @returns {string|null}
 */
export const getToken = () => {
  return localStorage.getItem('token');
};

/**
 * Get stored user
 * @returns {object|null}
 */
export const getStoredUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

// ============================================
// API REQUEST HELPER (for other endpoints)
// ============================================

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/tenders/assign')
 * @param {object} options - Fetch options
 * @returns {Promise}
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
    credentials: 'include',
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, defaultOptions);
    const data = await response.json();

    if (!response.ok) {
      // If unauthorized, clear token and redirect to login
      if (response.status === 401) {
        logout();
      }
      throw new Error(data.message || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

// ============================================
// DEFAULT EXPORT (if using default import)
// ============================================

export default {
  login,
  getCurrentUser,
  logout,
  isAuthenticated,
  getToken,
  getStoredUser,
  apiRequest,
};




