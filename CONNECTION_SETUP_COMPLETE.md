# ✅ Backend to Frontend Connection - Setup Complete!

## What Has Been Configured

### 1. ✅ Updated API Client (`src/utils/apiClient.js`)
   - Added authentication headers (Bearer token)
   - Configured to use backend URL: `http://localhost:3001/api`
   - Added automatic token handling and 401 redirect
   - Added credentials support for CORS

### 2. ✅ Created Auth API Service (`src/services/authAPI.js`)
   - `login(email, password, role)` - Connect to backend login
   - `getCurrentUser()` - Get current user from backend
   - `logout()` - Clear auth and redirect
   - `isAuthenticated()` - Check auth status
   - `apiRequest()` - Helper for authenticated requests

### 3. ✅ Environment Configuration
   - API URL defaults to `http://localhost:3001/api`
   - Optional: Create `.env` file in frontend root with:
     ```
     REACT_APP_API_URL=http://localhost:3001/api
     ```

## How to Use

### Option 1: Use the New Auth API Service

```javascript
import { login, getCurrentUser, logout, isAuthenticated } from './services/authAPI';

// In your login component
const handleLogin = async () => {
  try {
    const response = await login('admin@onixgroup.ae', 'admin123', 'ADMIN');
    if (response.success) {
      // Redirect to dashboard
      window.location.href = '/dashboard';
      // or use navigate('/dashboard') if using React Router
    }
  } catch (error) {
    console.error('Login failed:', error.message);
  }
};
```

### Option 2: Use the Updated API Client

```javascript
import { apiClient } from './utils/apiClient';

// All requests automatically include auth token
const fetchClients = async () => {
  try {
    const data = await apiClient.get('/clients');
    return data;
  } catch (error) {
    console.error('Error:', error.message);
  }
};

// Create a client
const createClient = async (clientData) => {
  try {
    const data = await apiClient.post('/clients', clientData);
    return data;
  } catch (error) {
    console.error('Error:', error.message);
  }
};
```

## Backend Test Credentials

After seeding the database, use these credentials:

**Admin:**
- Email: `admin@onixgroup.ae`
- Password: `admin123`
- Role: `ADMIN`

**Tender Engineer:**
- Email: `engineer@onixgroup.ae`
- Password: `engineer@123`
- Role: `TENDER_ENGINEER`

## Available Backend Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires auth)

### Clients (when implemented)
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Tenders
- Check `backend/src/routes/tenders.routes.ts` for available endpoints

## Testing the Connection

### Step 1: Start Backend
```bash
cd backend
npm run dev
```
Backend should be running on: `http://localhost:3001`

### Step 2: Test Backend Health
Open browser: `http://localhost:3001/health`
Should return: `{"status":"ok","timestamp":"..."}`

### Step 3: Start Frontend
```bash
cd ONIX-ERP-V2
npm start
```

### Step 4: Test Login from Frontend
1. Open frontend in browser (usually `http://localhost:3000`)
2. Go to login page
3. Use test credentials above
4. Check browser console (F12) → Network tab
5. Should see successful POST to `/api/auth/login`
6. Check Application tab → LocalStorage
7. Should see `token` and `user` stored

## Troubleshooting

### CORS Error
- ✅ Backend CORS is already configured to allow `http://localhost:3000`
- Make sure backend is running
- Check `FRONTEND_URL` in backend `.env` matches your frontend URL

### Connection Refused
- Make sure backend is running on port 3001
- Check if port 3001 is available
- Try accessing `http://localhost:3001/health` directly

### 401 Unauthorized
- Check if token is being sent in Authorization header
- Token should be in format: `Bearer <token>`
- Make sure you're logged in (token exists in localStorage)

### Token Not Found
- Make sure login was successful
- Check localStorage has `token` key
- Try logging in again

## Next Steps

1. ✅ Backend connection configured
2. ⏭️ Update your login component to use `authAPI.login()`
3. ⏭️ Update components to use `apiClient` for API calls
4. ⏭️ Implement protected routes using `isAuthenticated()`
5. ⏭️ Add error handling for network errors

## Example: Updating CreateCompanyPageRefactored.js

```javascript
import { apiClient } from '../utils/apiClient';

// In handleSubmit function
const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    // If editing
    if (isEditMode) {
      const response = await apiClient.put(`/clients/${companyId}`, form);
      console.log('Company updated:', response);
    } else {
      // Creating new
      const response = await apiClient.post('/clients', form);
      console.log('Company created:', response);
    }
    navigate('/clients');
  } catch (error) {
    console.error('Error saving company:', error);
    // Handle error (show notification, etc.)
  }
};
```

---

**Connection setup complete! You can now use the backend API from your frontend.** 🎉













