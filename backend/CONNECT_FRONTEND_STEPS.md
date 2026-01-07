# Step-by-Step Guide: Connect Frontend to Backend Authentication

## Prerequisites Checklist
- [ ] Backend server is running
- [ ] Database is set up and seeded
- [ ] Frontend project is ready

---

## STEP 1: Start the Backend Server

### 1.1 Navigate to backend directory
```bash
cd backend
```

### 1.2 Install dependencies (if not done)
```bash
npm install
```

### 1.3 Set up environment variables
Create a `.env` file in the `backend` folder:
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

DATABASE_URL="postgresql://user:password@localhost:5432/onix_erp?schema=public"

JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

### 1.4 Start the backend server
```bash
npm run dev
```

**✅ Success:** You should see:
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🏥 Health check: http://localhost:3001/health
```

### 1.5 Test backend is working
Open browser or use curl:
```bash
curl http://localhost:3001/health
```
Should return: `{"status":"ok","timestamp":"..."}`

---

## STEP 2: Configure Frontend

### 2.1 Create API Service File

Create a file: `src/services/api.ts` (or `src/utils/api.ts`)

**For React/TypeScript:**
```typescript
const API_BASE_URL = 'http://localhost:3001/api';

export interface LoginCredentials {
  email: string;
  password: string;
  role: 'ADMIN' | 'TENDER_ENGINEER' | 'PROJECT_MANAGER' | 'CONTRACTOR';
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Login function
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Login failed');
  }

  return data;
};

// Get current user function
export const getCurrentUser = async (token: string): Promise<ApiResponse<User>> => {
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
    throw new Error(data.message || 'Failed to get current user');
  }

  return data;
};
```

**For JavaScript (no TypeScript):**
```javascript
const API_BASE_URL = 'http://localhost:3001/api';

export const login = async (credentials) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Login failed');
  }

  return data;
};

export const getCurrentUser = async (token) => {
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
    throw new Error(data.message || 'Failed to get current user');
  }

  return data;
};
```

---

## STEP 3: Create Login Component

### 3.1 Create Login Page Component

**React/TypeScript Example:**
```typescript
import { useState } from 'react';
import { login } from '../services/api';
import { useNavigate } from 'react-router-dom'; // if using React Router

function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'ADMIN' as const,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(formData);
      
      // Store token and user data
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Redirect to dashboard
      navigate('/dashboard'); // or window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Login to ONIX ERP</h2>
      
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            placeholder="admin@onixgroup.ae"
          />
        </div>

        <div>
          <label>Password:</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            placeholder="Enter password"
          />
        </div>

        <div>
          <label>Role:</label>
          <select
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
          >
            <option value="ADMIN">Admin</option>
            <option value="TENDER_ENGINEER">Tender Engineer</option>
            <option value="PROJECT_MANAGER">Project Manager</option>
            <option value="CONTRACTOR">Contractor</option>
          </select>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div className="test-credentials">
        <h3>Test Credentials:</h3>
        <p><strong>Admin:</strong> admin@onixgroup.ae / admin123</p>
        <p><strong>Engineer:</strong> engineer@onixgroup.ae / engineer@123</p>
      </div>
    </div>
  );
}

export default LoginPage;
```

**React/JavaScript Example:**
```javascript
import { useState } from 'react';
import { login } from '../services/api';
import { useNavigate } from 'react-router-dom';

function LoginPage() {
  const navigate = useNavigate();
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
      const response = await login(formData);
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Login to ONIX ERP</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Password"
          required
        />
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
        >
          <option value="ADMIN">Admin</option>
          <option value="TENDER_ENGINEER">Tender Engineer</option>
        </select>
        {error && <div>{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
```

---

## STEP 4: Create Auth Context/Provider (Optional but Recommended)

**Create `src/contexts/AuthContext.tsx`:**
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentUser, User } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
      // Verify token is still valid
      getCurrentUser(storedToken)
        .then((response) => {
          if (response.data) {
            setUser(response.data);
          }
        })
        .catch(() => {
          // Token invalid, clear storage
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

**Wrap your app with AuthProvider:**
```typescript
// App.tsx or main.tsx
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      {/* Your app components */}
    </AuthProvider>
  );
}
```

---

## STEP 5: Create Protected Route Component

**Create `src/components/ProtectedRoute.tsx`:**
```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

**Use in your routes:**
```typescript
import { ProtectedRoute } from './components/ProtectedRoute';

<Route
  path="/dashboard"
  element={
    <ProtectedRoute requiredRole="ADMIN">
      <Dashboard />
    </ProtectedRoute>
  }
/>
```

---

## STEP 6: Test the Connection

### 6.1 Test Login
1. Open your frontend app
2. Navigate to login page
3. Enter test credentials:
   - Email: `admin@onixgroup.ae`
   - Password: `admin123`
   - Role: `ADMIN`
4. Click Login

### 6.2 Check Browser Console
- Open Developer Tools (F12)
- Check Network tab for API calls
- Should see successful POST to `/api/auth/login`
- Response should contain token and user data

### 6.3 Verify Token Storage
- Check Application/Storage tab
- Look for `token` and `user` in localStorage
- Token should be a long JWT string

### 6.4 Test Protected Route
- Try accessing a protected page
- Should redirect to login if not authenticated
- Should show content if authenticated

---

## STEP 7: Troubleshooting

### Problem: CORS Error
**Error:** `Access to fetch at 'http://localhost:3001/api/auth/login' from origin 'http://localhost:3000' has been blocked by CORS policy`

**Solution:**
1. Make sure backend is running
2. Check `FRONTEND_URL` in backend `.env` matches your frontend URL
3. Backend CORS is configured to allow common ports - should work automatically

### Problem: 401 Unauthorized
**Error:** `Invalid credentials` or `No token provided`

**Solution:**
1. Check email/password are correct
2. Verify role matches user's role in database
3. Make sure token is included in Authorization header: `Bearer <token>`

### Problem: Network Error / Connection Refused
**Error:** `Failed to fetch` or `Network request failed`

**Solution:**
1. Verify backend is running on port 3001
2. Check backend URL in frontend code matches backend URL
3. Try accessing `http://localhost:3001/health` directly in browser

### Problem: Token Not Persisting
**Solution:**
1. Check localStorage is available (not in incognito mode)
2. Verify token is being saved: `localStorage.getItem('token')`
3. Make sure token is included in subsequent requests

---

## Quick Test Commands

### Test Backend Directly:
```bash
# Test health endpoint
curl http://localhost:3001/health

# Test login endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@onixgroup.ae","password":"admin123","role":"ADMIN"}'
```

### Test from Browser Console:
```javascript
// Test login
fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@onixgroup.ae',
    password: 'admin123',
    role: 'ADMIN'
  })
})
.then(r => r.json())
.then(console.log);
```

---

## Summary Checklist

- [ ] Backend server running on port 3001
- [ ] Database seeded with test users
- [ ] Frontend API service file created
- [ ] Login component created
- [ ] Token stored in localStorage after login
- [ ] Protected routes working
- [ ] Can access `/api/auth/me` with token

**✅ You're all set! Your frontend is now connected to the backend authentication system.**












