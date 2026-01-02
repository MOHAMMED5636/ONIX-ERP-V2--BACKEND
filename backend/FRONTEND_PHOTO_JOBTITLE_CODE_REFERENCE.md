# 📸 Frontend Photo & Job Title - Code Reference

> **Note:** This is a reference/documentation file. The actual implementation has been completed in separate component files.

## ✅ Implementation Status

All code has been implemented in the following files:
- ✅ `src/services/authAPI.js` - API functions added
- ✅ `src/components/PhotoUpload.jsx` - Component created
- ✅ `src/components/ProfileForm.jsx` - Component created
- ✅ `src/components/employees/CreateEmployeeForm.jsx` - Updated
- ✅ `src/layout/Navbar.js` - Updated to show photo/jobTitle
- ✅ `src/layout/Sidebar.js` - Updated to show photo/jobTitle

---

## 📋 Code Reference (For Documentation Only)

### **1. API Service Functions**

```javascript
// File: src/services/authAPI.js

// Update profile (photo + jobTitle)
export const updateProfile = async (formData) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
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
export const createEmployeeWithPhoto = async (formData) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

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

---

### **2. PhotoUpload Component**

**File:** `src/components/PhotoUpload.jsx`

```jsx
import { useState, useEffect } from 'react';

const PhotoUpload = ({ currentPhoto, onPhotoChange, size = 'md' }) => {
  const [preview, setPreview] = useState(currentPhoto || null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    setPreview(currentPhoto || null);
  }, [currentPhoto]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        alert('Please select an image file (JPEG, PNG, GIF, or WebP)');
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

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  };

  return (
    <div className="photo-upload">
      <div className={`photo-preview ${sizeClasses[size]} mx-auto mb-4`}>
        {preview ? (
          <img 
            src={preview} 
            alt="Profile preview" 
            className={`${sizeClasses[size]} rounded-full object-cover border-2 border-gray-300`}
          />
        ) : (
          <div className={`${sizeClasses[size]} rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300`}>
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
      </div>
      <label className="block">
        <span className="sr-only">Choose profile photo</span>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </label>
      {file && (
        <p className="text-sm text-gray-500 mt-2 text-center">
          Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
        </p>
      )}
    </div>
  );
};

export default PhotoUpload;
```

---

### **3. ProfileForm Component**

**File:** `src/components/ProfileForm.jsx`

```jsx
import { useState, useEffect } from 'react';
import { updateProfile } from '../services/authAPI';
import PhotoUpload from './PhotoUpload';
import { useAuth } from '../contexts/AuthContext';

const ProfileForm = ({ onUpdate }) => {
  const { user, refreshUser } = useAuth();
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setJobTitle(user.jobTitle || '');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      if (photo) {
        formData.append('photo', photo);
      }
      if (jobTitle !== undefined) {
        formData.append('jobTitle', jobTitle);
      }

      const response = await updateProfile(formData);
      
      if (response.success) {
        setSuccess(true);
        if (refreshUser) {
          await refreshUser();
        }
        if (onUpdate) {
          onUpdate(response.data);
        }
        setPhoto(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Profile Photo
        </label>
        <PhotoUpload 
          currentPhoto={user?.photo} 
          onPhotoChange={setPhoto}
          size="lg"
        />
        <p className="text-xs text-gray-500 mt-2">
          Accepted formats: JPEG, PNG, GIF, WebP (Max 5MB)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Job Title / Designation
        </label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g., Senior Engineer, Project Manager, HR Specialist"
          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          Profile updated successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Updating...' : 'Update Profile'}
      </button>
    </form>
  );
};

export default ProfileForm;
```

---

### **4. CreateEmployeeForm Updates**

**File:** `src/components/employees/CreateEmployeeForm.jsx`

**Key Changes:**
- Added `jobTitle` to form state
- Added `photo` state for file upload
- Import `PhotoUpload` component
- Import `createEmployeeWithPhoto` function
- Use FormData in submit handler
- Add jobTitle input field
- Add PhotoUpload component

---

### **5. Navbar/Sidebar Updates**

**Files:** 
- `src/layout/Navbar.js`
- `src/layout/Sidebar.js`

**Key Changes:**
- Display `user.photo` instead of generated avatar
- Display `user.jobTitle` instead of role
- Fallback to generated avatar if no photo

---

## 📚 Usage Examples

### **Update Profile**

```jsx
import ProfileForm from '../components/ProfileForm';

function SettingsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>
      <ProfileForm />
    </div>
  );
}
```

### **Display User Photo**

```jsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user } = useAuth();
  
  return (
    <div>
      {user?.photo ? (
        <img src={user.photo} alt={user.firstName} className="w-12 h-12 rounded-full" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
      )}
      <p>{user?.jobTitle || user?.role}</p>
    </div>
  );
}
```

---

## ✅ Implementation Complete

All code has been implemented and is ready to use. See `FRONTEND_PHOTO_JOBTITLE_CHANGES.md` for complete documentation.

