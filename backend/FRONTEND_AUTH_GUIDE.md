# Frontend Authentication Integration Guide

## Base URL
```
http://localhost:3001/api/auth
```

## Authentication Endpoints

### 1. Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "email": "admin@onixgroup.ae",
  "password": "admin123",
  "role": "ADMIN"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "admin@onixgroup.ae",
      "firstName": "Admin",
      "lastName": "User",
      "role": "ADMIN"
    }
  }
}
```

**Error Responses:**
- `400` - Missing fields or invalid email format
- `401` - Invalid credentials
- `403` - Account deactivated
- `500` - Server error

---

### 2. Get Current User
**GET** `/api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "admin@onixgroup.ae",
    "firstName": "Admin",
    "lastName": "User",
    "role": "ADMIN"
  }
}
```

**Error Responses:**
- `401` - No token provided or invalid/expired token

---

## Frontend Implementation Examples

### React/TypeScript Example

```typescript
// auth.service.ts
const API_BASE_URL = 'http://localhost:3001/api';

interface LoginCredentials {
  email: string;
  password: string;
  role: 'ADMIN' | 'TENDER_ENGINEER' | 'PROJECT_MANAGER' | 'CONTRACTOR';
}

interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
    };
  };
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for CORS with credentials
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    return response.json();
  },

  async getCurrentUser(token: string) {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  },
};
```

### Using in React Component

```typescript
import { useState } from 'react';
import { authService } from './services/auth.service';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'TENDER_ENGINEER'>('ADMIN');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await authService.login({ email, password, role });
      
      // Store token in localStorage or state management
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <select value={role} onChange={(e) => setRole(e.target.value as any)}>
        <option value="ADMIN">Admin</option>
        <option value="TENDER_ENGINEER">Tender Engineer</option>
      </select>
      {error && <div className="error">{error}</div>}
      <button type="submit">Login</button>
    </form>
  );
}
```

### Axios Example

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  withCredentials: true,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Login
export const login = async (credentials: LoginCredentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

// Get current user
export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};
```

---

## Default Test Users

### Admin User
- **Email:** `admin@onixgroup.ae`
- **Password:** `admin123`
- **Role:** `ADMIN`

### Tender Engineer
- **Email:** `engineer@onixgroup.ae`
- **Password:** `engineer@123`
- **Role:** `TENDER_ENGINEER`

---

## CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:3000` (React default)
- `http://localhost:5173` (Vite default)
- `http://localhost:5174`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`
- Any origin in development mode

Make sure your frontend URL matches one of these or update `FRONTEND_URL` in `.env`.

---

## Token Storage

Store the JWT token securely:
- **LocalStorage** (for web apps) - Simple but vulnerable to XSS
- **HttpOnly Cookies** (more secure) - Requires backend cookie setup
- **Memory/State** (most secure) - Token cleared on page refresh

**Recommended:** Use HttpOnly cookies for production, localStorage for development.

---

## Error Handling

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message here"
}
```

---

## Testing with cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@onixgroup.ae",
    "password": "admin123",
    "role": "ADMIN"
  }'

# Get current user (replace TOKEN with actual token)
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

---

## Next Steps

1. ✅ Authentication endpoints are ready
2. ⏳ Implement token refresh (if needed)
3. ⏳ Add logout endpoint (optional - JWT is stateless)
4. ⏳ Implement protected routes in frontend










