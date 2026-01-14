// ============================================
// DASHBOARD COMPONENT
// Copy to: ERP-FRONTEND/src/pages/Dashboard.jsx or src/components/Dashboard.jsx
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDashboardStats, getDashboardSummary } from '../services/dashboardAPI';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State for dashboard data
  const [stats, setStats] = useState({
    activeProjects: 0,
    activeTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    teamMembers: 0,
    inProgressTenders: 0,
    totalClients: 0,
    totalTenders: 0,
    pendingInvitations: 0,
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  /**
   * Fetch dashboard statistics from backend
   * Called on component mount and when navigating back to dashboard
   */
  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch dashboard summary (contains activeProjects and activeTasks)
      const response = await getDashboardSummary();
      
      if (response.success && response.data) {
        setStats({
          activeProjects: response.data.activeProjects || 0,
          activeTasks: response.data.activeTasks || 0,
          completedTasks: 0, // Can be fetched from full stats if needed
          pendingTasks: 0,
          inProgressTasks: 0,
          teamMembers: response.data.teamMembers || 0,
          inProgressTenders: response.data.inProgressTenders || 0,
          totalClients: response.data.totalClients || 0,
          totalTenders: response.data.totalTenders || 0,
          pendingInvitations: response.data.pendingInvitations || 0,
        });
        setLastUpdated(new Date());
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Failed to load dashboard data. Please try again.');
      // Set default values on error
      setStats({
        activeProjects: 0,
        activeTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        teamMembers: 0,
        inProgressTenders: 0,
        totalClients: 0,
        totalTenders: 0,
        pendingInvitations: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch detailed stats (includes task breakdown)
   */
  const fetchDetailedStats = async () => {
    try {
      const response = await getDashboardStats();
      
      if (response.success && response.data) {
        setStats(prevStats => ({
          ...prevStats,
          activeProjects: response.data.activeProjects || 0,
          activeTasks: response.data.activeTasks || 0,
          completedTasks: response.data.completedTasks || 0,
          pendingTasks: response.data.pendingTasks || 0,
          inProgressTasks: response.data.inProgressTasks || 0,
        }));
      }
    } catch (err) {
      console.error('Error fetching detailed stats:', err);
    }
  };

  /**
   * Initial load and refresh on navigation
   */
  useEffect(() => {
    fetchDashboardStats();
  }, []);

  /**
   * Refresh dashboard when navigating back from projects/tasks pages
   * This ensures counts are updated after creating/editing projects or tasks
   */
  useEffect(() => {
    // Check if we're coming back from a project or task page
    const shouldRefresh = location.state?.refreshDashboard || 
                         location.pathname === '/dashboard';
    
    if (shouldRefresh) {
      fetchDashboardStats();
      // Clear the refresh flag
      if (location.state?.refreshDashboard) {
        window.history.replaceState({}, document.title);
      }
    }
  }, [location]);

  /**
   * Auto-refresh dashboard every 30 seconds (optional)
   * Uncomment if you want automatic refresh
   */
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     fetchDashboardStats();
  //   }, 30000); // Refresh every 30 seconds

  //   return () => clearInterval(interval);
  // }, []);

  /**
   * Manual refresh handler
   */
  const handleRefresh = () => {
    fetchDashboardStats();
  };

  /**
   * Navigation handlers
   */
  const handleNavigateToProjects = () => {
    navigate('/projects', { state: { returnTo: '/dashboard' } });
  };

  const handleNavigateToTasks = () => {
    navigate('/tasks', { state: { returnTo: '/dashboard' } });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back! Here's your company snapshot.
            {lastUpdated && (
              <span className="text-sm text-gray-500 ml-2">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button
            onClick={fetchDashboardStats}
            className="ml-4 text-red-800 underline hover:text-red-900"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Active Projects Card */}
        <div 
          className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={handleNavigateToProjects}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Active Projects</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.activeProjects}</p>
              <p className="text-xs text-gray-500 mt-1">Click to view all projects</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active Tasks Card */}
        <div 
          className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={handleNavigateToTasks}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Active Tasks</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.activeTasks}</p>
              <p className="text-xs text-gray-500 mt-1">Click to view all tasks</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>
        </div>

        {/* Completed Tasks Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Completed Tasks</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">{stats.completedTasks}</p>
            </div>
            <div className="bg-purple-100 rounded-full p-3">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Team Members Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Team Members</p>
              <p className="text-3xl font-bold text-orange-600 mt-2">{stats.teamMembers}</p>
            </div>
            <div className="bg-orange-100 rounded-full p-3">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Task Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600 text-sm font-medium">Pending Tasks</p>
          <p className="text-2xl font-bold text-yellow-600 mt-2">{stats.pendingTasks}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600 text-sm font-medium">In Progress Tasks</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{stats.inProgressTasks}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600 text-sm font-medium">Total Clients</p>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{stats.totalClients}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => navigate('/projects/new', { state: { returnTo: '/dashboard' } })}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
          <button
            onClick={() => navigate('/tasks/new', { state: { returnTo: '/dashboard' } })}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
          <button
            onClick={handleNavigateToProjects}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            View All Projects
          </button>
          <button
            onClick={handleNavigateToTasks}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            View All Tasks
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


