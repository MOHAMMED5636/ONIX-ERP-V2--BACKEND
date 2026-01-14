// ============================================
// CUSTOM HOOK FOR DASHBOARD DATA
// Copy to: ERP-FRONTEND/src/hooks/useDashboard.js
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getDashboardStats, getDashboardSummary } from '../services/dashboardAPI';

/**
 * Custom hook for dashboard data management
 * Handles fetching, refreshing, and state management
 */
export const useDashboard = (autoRefresh = false, refreshInterval = 30000) => {
  const location = useLocation();
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
   * Fetch dashboard statistics
   */
  const fetchStats = useCallback(async (detailed = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = detailed 
        ? await getDashboardStats() 
        : await getDashboardSummary();
      
      if (response.success && response.data) {
        setStats(prevStats => ({
          ...prevStats,
          activeProjects: response.data.activeProjects || 0,
          activeTasks: response.data.activeTasks || 0,
          completedTasks: response.data.completedTasks || prevStats.completedTasks || 0,
          pendingTasks: response.data.pendingTasks || prevStats.pendingTasks || 0,
          inProgressTasks: response.data.inProgressTasks || prevStats.inProgressTasks || 0,
          teamMembers: response.data.teamMembers || 0,
          inProgressTenders: response.data.inProgressTenders || 0,
          totalClients: response.data.totalClients || 0,
          totalTenders: response.data.totalTenders || 0,
          pendingInvitations: response.data.pendingInvitations || 0,
        }));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(() => {
    fetchStats(true); // Fetch detailed stats on manual refresh
  }, [fetchStats]);

  /**
   * Initial load
   */
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /**
   * Refresh when navigating back to dashboard
   */
  useEffect(() => {
    if (location.pathname === '/dashboard' && location.state?.refreshDashboard) {
      fetchStats(true);
      // Clear refresh flag
      window.history.replaceState({}, document.title);
    }
  }, [location, fetchStats]);

  /**
   * Auto-refresh interval (optional)
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStats]);

  return {
    stats,
    loading,
    error,
    lastUpdated,
    refresh,
    fetchStats,
  };
};

export default useDashboard;


