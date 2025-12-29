# Employee Creation - Quick Start Guide

## 🚀 Quick Setup (5 Steps)

### Step 1: Run Database Migration

```bash
cd backend
npx prisma migrate dev --name add_employee_features
npx prisma generate
```

### Step 2: Restart Backend Server

```bash
npm run dev
```

### Step 3: Copy Frontend Components

1. Copy `FRONTEND_EMPLOYEE_CREATE_FORM.jsx` → `src/components/employees/CreateEmployeeForm.jsx`
2. Copy `FRONTEND_PASSWORD_CHANGE.jsx` → `src/components/auth/ChangePassword.jsx`

### Step 4: Update Frontend Routes

Add to your router:
```javascript
import ChangePassword from './components/auth/ChangePassword';
import CreateEmployeeForm from './components/employees/CreateEmployeeForm';

<Route path="/change-password" element={<ChangePassword />} />
<Route path="/employees/create" element={
  <ProtectedRoute requiredRole={['ADMIN', 'HR']}>
    <CreateEmployeeForm />
  </ProtectedRoute>
} />
```

### Step 5: Update Login Component

In your `Login.jsx`, after successful login:

```javascript
if (response.success) {
  if (response.requiresPasswordChange) {
    // Store token for password change endpoint
    localStorage.setItem('token', response.data.token);
    navigate('/change-password');
  } else {
    await setAuthUser(response.data.token);
    navigate('/dashboard');
  }
}
```

---

## ✅ Test It

1. **Login as Admin** (`admin@onixgroup.ae` / `admin123`)
2. **Go to** `/employees/create` or add "Add Employee" button
3. **Create Employee:**
   - First Name: "John"
   - Last Name: "Doe"
   - Role: "EMPLOYEE"
   - Click "Create"
4. **Save credentials** from modal
5. **Logout and login** with new employee credentials
6. **Should redirect** to password change page
7. **Change password** and access dashboard

---

## 📋 API Endpoints

- `POST /api/employees` - Create employee (Admin/HR)
- `GET /api/employees` - List employees (Admin/HR)
- `GET /api/employees/:id` - Get employee (Admin/HR or self)
- `PUT /api/employees/:id` - Update employee (Admin/HR)
- `DELETE /api/employees/:id` - Deactivate employee (Admin/HR)
- `POST /api/auth/change-password` - Change password (All)
- `POST /api/auth/reset-password/:userId` - Reset password (Admin/HR)

---

## 🔐 Security Features

✅ Password hashing (bcrypt)  
✅ Force password change on first login  
✅ Role-based access control  
✅ JWT authentication  
✅ Secure password generation  
✅ Password strength validation  

---

**See `EMPLOYEE_CREATION_IMPLEMENTATION_GUIDE.md` for complete documentation.**

