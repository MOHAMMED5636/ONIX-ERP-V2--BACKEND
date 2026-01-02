# 📸 Photo & Job Title Implementation Guide

## ✅ Backend Implementation Complete

### **1. Database Schema Updated**
- Added `photo` field (String?) to User model
- Added `jobTitle` field (String?) to User model

### **2. File Upload Middleware Created**
- **File:** `src/middleware/upload.middleware.ts`
- Handles photo uploads (JPEG, PNG, GIF, WebP)
- Max file size: 5MB
- Stores files in `uploads/photos/` directory
- Generates unique filenames

### **3. Controllers Updated**

#### **Auth Controller** (`src/controllers/auth.controller.ts`)
- `login()` - Returns `photo` and `jobTitle` in user data
- `getCurrentUser()` - Returns `photo` and `jobTitle` with full URL

#### **Employee Controller** (`src/controllers/employee.controller.ts`)
- `createEmployee()` - Accepts `photo` (file) and `jobTitle` (string)
- `updateEmployee()` - Updates `photo` and `jobTitle`
- `getEmployeeById()` - Returns `photo` and `jobTitle`
- `getEmployees()` - Returns `photo` and `jobTitle` in list

#### **Profile Controller** (`src/controllers/profile.controller.ts`) - NEW
- `updateProfile()` - Allows users to update their own photo and jobTitle

### **4. Routes Updated**

#### **Auth Routes** (`src/routes/auth.routes.ts`)
- `PUT /api/auth/profile` - Update own profile (photo + jobTitle)

#### **Employee Routes** (`src/routes/employee.routes.ts`)
- `POST /api/employees` - Create employee with photo upload
- `PUT /api/employees/:id` - Update employee with photo upload

### **5. Static File Serving**
- Added static file serving in `app.ts`
- Photos accessible at: `http://localhost:3001/uploads/photos/{filename}`

---

## 📋 API Endpoints

### **1. Update Own Profile**
```http
PUT /api/auth/profile
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- photo: (file) - Optional image file
- jobTitle: (string) - Optional job title
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "user-id",
    "email": "user@onixgroup.ae",
    "firstName": "John",
    "lastName": "Doe",
    "role": "EMPLOYEE",
    "jobTitle": "Senior Engineer",
    "photo": "http://localhost:3001/uploads/photos/photo-1234567890.jpg",
    ...
  }
}
```

### **2. Create Employee with Photo**
```http
POST /api/employees
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- firstName: (string) - Required
- lastName: (string) - Required
- role: (string) - Optional, default: EMPLOYEE
- phone: (string) - Optional
- department: (string) - Optional
- position: (string) - Optional
- jobTitle: (string) - Optional
- employeeId: (string) - Optional
- photo: (file) - Optional image file
- projectIds: (array) - Optional array of project IDs
```

### **3. Update Employee with Photo**
```http
PUT /api/employees/:id
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- firstName: (string) - Optional
- lastName: (string) - Optional
- jobTitle: (string) - Optional
- photo: (file) - Optional image file
- ... (other fields)
```

---

## 🎨 Frontend Implementation Guide

### **Step 1: Update API Service**

Add photo upload functions to your API service:

```javascript
// src/services/authAPI.js or similar

const API_BASE_URL = 'http://localhost:3001/api';

// Update profile (photo + jobTitle)
export const updateProfile = async (formData) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      // Don't set Content-Type - browser will set it with boundary for FormData
    },
    body: formData, // FormData object
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to update profile');
  }
  return data;
};

// Create employee with photo
export const createEmployee = async (formData) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_BASE_URL}/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to create employee');
  }
  return data;
};
```

### **Step 2: Create Photo Upload Component**

```jsx
// src/components/PhotoUpload.jsx
import { useState } from 'react';

const PhotoUpload = ({ currentPhoto, onPhotoChange }) => {
  const [preview, setPreview] = useState(currentPhoto || null);
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // Validate file size (5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      setFile(selectedFile);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
      
      // Notify parent component
      if (onPhotoChange) {
        onPhotoChange(selectedFile);
      }
    }
  };

  return (
    <div className="photo-upload">
      <div className="photo-preview">
        {preview ? (
          <img 
            src={preview} 
            alt="Profile preview" 
            className="w-32 h-32 rounded-full object-cover"
          />
        ) : (
          <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400">No Photo</span>
          </div>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="mt-2"
      />
      {file && (
        <p className="text-sm text-gray-500 mt-1">
          Selected: {file.name}
        </p>
      )}
    </div>
  );
};

export default PhotoUpload;
```

### **Step 3: Update Profile Form**

```jsx
// src/components/ProfileForm.jsx
import { useState } from 'react';
import { updateProfile } from '../services/authAPI';
import PhotoUpload from './PhotoUpload';

const ProfileForm = ({ user, onUpdate }) => {
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (photo) {
        formData.append('photo', photo);
      }
      if (jobTitle) {
        formData.append('jobTitle', jobTitle);
      }

      const response = await updateProfile(formData);
      
      if (response.success) {
        alert('Profile updated successfully!');
        if (onUpdate) {
          onUpdate(response.data);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">
          Profile Photo
        </label>
        <PhotoUpload 
          currentPhoto={user?.photo} 
          onPhotoChange={setPhoto}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Job Title
        </label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g., Senior Engineer, Project Manager"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
      >
        {loading ? 'Updating...' : 'Update Profile'}
      </button>
    </form>
  );
};

export default ProfileForm;
```

### **Step 4: Update Employee Creation Form**

```jsx
// src/components/employees/CreateEmployeeForm.jsx
import { useState } from 'react';
import { createEmployee } from '../../services/authAPI';
import PhotoUpload from '../PhotoUpload';

const CreateEmployeeForm = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE',
    phone: '',
    department: '',
    position: '',
    jobTitle: '',
    employeeId: '',
  });
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formDataToSend = new FormData();
      
      // Append all form fields
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          formDataToSend.append(key, formData[key]);
        }
      });

      // Append photo if selected
      if (photo) {
        formDataToSend.append('photo', photo);
      }

      const response = await createEmployee(formDataToSend);
      
      if (response.success) {
        // Show credentials modal
        alert(`Employee created!\nEmail: ${response.data.credentials.email}\nPassword: ${response.data.credentials.temporaryPassword}`);
        // Reset form
        setFormData({
          firstName: '',
          lastName: '',
          role: 'EMPLOYEE',
          phone: '',
          department: '',
          position: '',
          jobTitle: '',
          employeeId: '',
        });
        setPhoto(null);
      }
    } catch (error) {
      alert('Error creating employee: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ... other form fields ... */}
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Job Title
        </label>
        <input
          type="text"
          value={formData.jobTitle}
          onChange={(e) => setFormData({...formData, jobTitle: e.target.value})}
          placeholder="e.g., Senior Engineer"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Profile Photo
        </label>
        <PhotoUpload onPhotoChange={setPhoto} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
      >
        {loading ? 'Creating...' : 'Create Employee'}
      </button>
    </form>
  );
};
```

### **Step 5: Display Photo in Profile**

```jsx
// src/components/UserProfile.jsx
const UserProfile = ({ user }) => {
  const photoUrl = user?.photo || null;
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="user-profile">
      <div className="avatar">
        {photoUrl ? (
          <img 
            src={photoUrl} 
            alt={`${user.firstName} ${user.lastName}`}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
            {initials}
          </div>
        )}
      </div>
      <div className="user-info">
        <h3>{user.firstName} {user.lastName}</h3>
        {user.jobTitle && (
          <p className="text-sm text-gray-500">{user.jobTitle}</p>
        )}
        <p className="text-xs text-gray-400">{user.role}</p>
      </div>
    </div>
  );
};
```

---

## 🗄️ Database Migration

After updating the schema, run:

```bash
cd backend
npx prisma migrate dev --name add_photo_jobtitle
npx prisma generate
```

---

## ✅ Checklist

### Backend:
- [x] Schema updated with `photo` and `jobTitle` fields
- [x] Upload middleware created
- [x] Controllers updated
- [x] Routes configured
- [x] Static file serving enabled

### Frontend (To Do):
- [ ] Update API service with photo upload functions
- [ ] Create PhotoUpload component
- [ ] Update ProfileForm component
- [ ] Update Employee creation form
- [ ] Display photo in user profile/navbar
- [ ] Display jobTitle in user profile/navbar

---

## 🎯 Next Steps

1. **Run Database Migration:**
   ```bash
   cd backend
   npx prisma migrate dev --name add_photo_jobtitle
   npx prisma generate
   ```

2. **Update Frontend:**
   - Copy the components above to your ERP-FRONTEND project
   - Update your API service
   - Integrate into your existing forms

3. **Test:**
   - Upload a photo via profile update
   - Create employee with photo and jobTitle
   - Verify photos display correctly

---

**Backend is ready! Now implement the frontend components.** 🚀

