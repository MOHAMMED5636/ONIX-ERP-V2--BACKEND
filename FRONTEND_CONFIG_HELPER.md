# Frontend Configuration Helper

## 🔍 Find Your API Configuration File

Search for these files in your frontend project:
- `src/services/api.js`
- `src/services/api.ts`
- `src/utils/api.js`
- `src/config/api.js`
- `src/api/index.js`
- `src/lib/api.js`

Or search for: `localhost:3001` in your frontend codebase.

---

## 📝 Update API Base URL

### Find this line:
```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

### Change to:
```javascript
const API_BASE_URL = 'http://192.168.1.151:3001/api';
```

---

## 🎯 Example Configurations

### React/Vite Example:
```javascript
// src/services/api.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.151:3001/api';

export default API_BASE_URL;
```

### Create React App Example:
```javascript
// src/services/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';

export default API_BASE_URL;
```

### Using Environment Variable (Best):
Create `.env` file in frontend root:

**For Vite:**
```env
VITE_API_URL=http://192.168.1.151:3001/api
```

**For Create React App:**
```env
REACT_APP_API_URL=http://192.168.1.151:3001/api
```

Then in code:
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.151:3001/api';
```

---

## ✅ After Updating

1. Restart your frontend server
2. Test: Open `http://192.168.1.151:3000` from another computer
3. Check browser console for any errors

---

## 🔄 Switch Between Local and Network

### Option 1: Use Environment Variable
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:3001/api' 
    : 'http://192.168.1.151:3001/api');
```

### Option 2: Auto-detect
```javascript
const getApiUrl = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  return `http://${hostname}:3001/api`;
};

const API_BASE_URL = getApiUrl();
```



