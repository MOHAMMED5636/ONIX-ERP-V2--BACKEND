// ============================================
// DASHBOARD HEADER - Dynamic User Profile Display
// Copy to: src/components/DashboardHeader.jsx
// ============================================

import { useAuth } from '../contexts/AuthContext';
import { logout } from '../services/api';
import { useNavigate } from 'react-router-dom';

function DashboardHeader() {
  const { user, logout: handleLogout } = useAuth();
  const navigate = useNavigate();

  const handleLogoutClick = async () => {
    try {
      await handleLogout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect even if logout fails
      navigate('/login');
    }
  };

  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return 'User';
    
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    if (user.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  };

  // Get role display name
  const getRoleDisplayName = () => {
    if (!user || !user.role) return '';
    
    const roleMap = {
      ADMIN: 'Administrator',
      TENDER_ENGINEER: 'Tender Engineer',
      PROJECT_MANAGER: 'Project Manager',
      CONTRACTOR: 'Contractor',
    };
    
    return roleMap[user.role] || user.role;
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-indigo-600">ONIX ERP</h1>
          </div>

          {/* User Profile Section */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {/* User Info */}
                <div className="flex items-center space-x-3">
                  {/* User Avatar/Initials */}
                  <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                    {getUserDisplayName()
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>

                  {/* User Details */}
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs text-gray-500">{getRoleDisplayName()}</p>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogoutClick}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default DashboardHeader;

