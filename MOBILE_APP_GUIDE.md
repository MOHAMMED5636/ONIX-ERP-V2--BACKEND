# 📱 Mobile App Development Guide - ERP System

## 🎯 Technology Comparison: React Native vs Flutter

### React Native ⚛️ (RECOMMENDED for You)

**Why React Native is Better for Your Project:**

✅ **Advantages:**
- **Same Language:** JavaScript/TypeScript (you already use this)
- **Code Reuse:** Can share 60-80% of code with your React web app
- **API Integration:** Can reuse your existing API service code
- **Faster Development:** Your team already knows React
- **Large Community:** Huge ecosystem and support
- **Hot Reload:** Fast development cycle
- **Native Performance:** Real native apps, not web views
- **Cross-Platform:** One codebase for iOS and Android

❌ **Disadvantages:**
- Slightly larger app size
- Some platform-specific code needed
- Occasional native module issues

### Flutter 🎨

**Why Flutter Might Not Be Best:**

✅ **Advantages:**
- Beautiful UI out of the box
- Excellent performance
- Single codebase for iOS, Android, Web, Desktop
- Strong Google support

❌ **Disadvantages:**
- **Different Language:** Dart (you'd need to learn)
- **No Code Reuse:** Can't share code with your React web app
- **Different Ecosystem:** New learning curve
- **API Integration:** Need to rewrite all API calls
- **Team Training:** Team needs to learn Dart/Flutter

---

## 🏆 Recommendation: **React Native**

**For your situation, React Native is the clear winner because:**

1. ✅ You already have a React web app
2. ✅ Your backend API is ready (REST API)
3. ✅ Can reuse API service code
4. ✅ Same development team skills
5. ✅ Faster time to market
6. ✅ Easier maintenance

---

## 📋 Prerequisites

### Required Software:
- Node.js 18+ (you already have this)
- React Native CLI or Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development - Mac only)
- Code Editor (VS Code recommended)

### Backend Requirements:
✅ Your backend is already ready!
- REST API endpoints ✅
- Authentication (JWT) ✅
- CORS configured ✅
- File upload support ✅

---

## 🚀 Step 1: Choose React Native Setup Method

### Option A: Expo (Easier - Recommended for Beginners)

**Advantages:**
- ✅ No native code setup needed
- ✅ Easy to start
- ✅ Built-in features (camera, notifications, etc.)
- ✅ Easy testing on real devices
- ✅ Over-the-air updates

**Limitations:**
- ❌ Some native modules not available
- ❌ Larger app size
- ❌ Less control over native code

### Option B: React Native CLI (More Control)

**Advantages:**
- ✅ Full native code access
- ✅ Smaller app size
- ✅ More customization
- ✅ Better for complex apps

**Limitations:**
- ❌ More setup required
- ❌ Need to configure native modules manually
- ❌ More complex build process

**Recommendation:** Start with **Expo** for faster development, migrate to CLI if needed later.

---

## 🛠️ Step 2: Setup React Native Project

### Using Expo (Recommended)

```bash
# Install Expo CLI globally
npm install -g expo-cli

# Create new React Native project
npx create-expo-app OnixERP-Mobile

# Navigate to project
cd OnixERP-Mobile

# Start development server
npx expo start
```

### Using React Native CLI

```bash
# Install React Native CLI
npm install -g react-native-cli

# Create new project
npx react-native init OnixERP-Mobile

# Navigate to project
cd OnixERP-Mobile

# For Android
npx react-native run-android

# For iOS (Mac only)
npx react-native run-ios
```

---

## 🔌 Step 3: Connect to Your Backend API

### Create API Service File

Create `src/services/api.js`:

```javascript
// API Configuration
const API_BASE_URL = 'http://192.168.1.151:3001/api'; // Your backend URL

// For production, use your hosted backend URL
// const API_BASE_URL = 'https://your-backend.com/api';

// Helper function for API calls
const apiRequest = async (endpoint, options = {}) => {
  const token = await getStoredToken();
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Token Management (using AsyncStorage)
import AsyncStorage from '@react-native-async-storage/async-storage';

export const getStoredToken = async () => {
  try {
    return await AsyncStorage.getItem('token');
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

export const setStoredToken = async (token) => {
  try {
    await AsyncStorage.setItem('token', token);
  } catch (error) {
    console.error('Error saving token:', error);
  }
};

export const removeStoredToken = async () => {
  try {
    await AsyncStorage.removeItem('token');
  } catch (error) {
    console.error('Error removing token:', error);
  }
};

// Authentication API
export const login = async (email, password, role) => {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
  
  if (response.success && response.data.token) {
    await setStoredToken(response.data.token);
  }
  
  return response;
};

export const getCurrentUser = async () => {
  return await apiRequest('/auth/me');
};

export const logout = async () => {
  await removeStoredToken();
  // Navigate to login screen
};

// Projects API
export const getProjects = async (filters = {}) => {
  const queryParams = new URLSearchParams(filters).toString();
  return await apiRequest(`/projects?${queryParams}`);
};

export const getProjectById = async (id) => {
  return await apiRequest(`/projects/${id}`);
};

export const createProject = async (projectData) => {
  return await apiRequest('/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
};

export const updateProject = async (id, projectData) => {
  return await apiRequest(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(projectData),
  });
};

// Tasks API
export const getTasks = async (filters = {}) => {
  const queryParams = new URLSearchParams(filters).toString();
  return await apiRequest(`/tasks?${queryParams}`);
};

export const getTaskById = async (id) => {
  return await apiRequest(`/tasks/${id}`);
};

export const createTask = async (taskData) => {
  return await apiRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
};

export const updateTaskStatus = async (id, status) => {
  return await apiRequest(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
};

// Dashboard API
export const getDashboardStats = async () => {
  return await apiRequest('/dashboard/stats');
};

export const getDashboardSummary = async () => {
  return await apiRequest('/dashboard/summary');
};

// Clients API
export const getClients = async () => {
  return await apiRequest('/clients');
};

export const createClient = async (clientData) => {
  return await apiRequest('/clients', {
    method: 'POST',
    body: JSON.stringify(clientData),
  });
};

// File Upload (for documents/attachments)
export const uploadFile = async (fileUri, endpoint, additionalData = {}) => {
  const token = await getStoredToken();
  
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'image/jpeg', // or detect from file
    name: 'photo.jpg',
  });
  
  // Add additional form data
  Object.keys(additionalData).forEach(key => {
    formData.append(key, additionalData[key]);
  });
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  });
  
  return await response.json();
};

export default {
  login,
  getCurrentUser,
  logout,
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  getTasks,
  getTaskById,
  createTask,
  updateTaskStatus,
  getDashboardStats,
  getDashboardSummary,
  getClients,
  createClient,
  uploadFile,
};
```

---

## 📦 Step 4: Install Required Packages

```bash
# Install AsyncStorage for token storage
npm install @react-native-async-storage/async-storage

# Install navigation (React Navigation)
npm install @react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs

# Install navigation dependencies
npm install react-native-screens react-native-safe-area-context

# For Expo
npx expo install react-native-screens react-native-safe-area-context

# Install HTTP client (optional, fetch is built-in)
# npm install axios

# Install UI components (optional)
npm install react-native-paper  # Material Design components
# or
npm install react-native-elements  # UI toolkit
```

---

## 🎨 Step 5: Create Login Screen

Create `src/screens/LoginScreen.js`:

```javascript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { login } from '../services/api';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const response = await login(email, password, role);
      
      if (response.success) {
        // Navigate to dashboard
        navigation.replace('Dashboard');
      } else {
        Alert.alert('Error', response.message || 'Login failed');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Onix ERP</Text>
      <Text style={styles.subtitle}>Login to continue</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Role"
        value={role}
        onChangeText={setRole}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
```

---

## 📊 Step 6: Create Dashboard Screen

Create `src/screens/DashboardScreen.js`:

```javascript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { getDashboardStats, getDashboardSummary } from '../services/api';

const DashboardScreen = ({ navigation }) => {
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [statsData, summaryData] = await Promise.all([
        getDashboardStats(),
        getDashboardSummary(),
      ]);
      
      setStats(statsData.data);
      setSummary(summaryData.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary?.activeProjects || 0}</Text>
          <Text style={styles.statLabel}>Active Projects</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary?.activeTasks || 0}</Text>
          <Text style={styles.statLabel}>Active Tasks</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary?.teamMembers || 0}</Text>
          <Text style={styles.statLabel}>Team Members</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Projects')}
      >
        <Text style={styles.buttonText}>View Projects</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Tasks')}
      >
        <Text style={styles.buttonText}>View Tasks</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DashboardScreen;
```

---

## 🔧 Step 7: Setup Navigation

Create `src/navigation/AppNavigator.js`:

```javascript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
// Import other screens...

const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Dashboard' }}
        />
        {/* Add more screens */}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
```

---

## 📱 Step 8: Update App.js

```javascript
import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return <AppNavigator />;
}
```

---

## 🌐 Step 9: Configure Network Access

### For Development (Local Network)

Your backend is already configured! Just use:
```javascript
const API_BASE_URL = 'http://192.168.1.151:3001/api';
```

### For Android Emulator

Android emulator uses `10.0.2.2` to access host machine:
```javascript
const API_BASE_URL = 'http://10.0.2.2:3001/api';
```

### For iOS Simulator

iOS simulator uses `localhost`:
```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

### For Production

Use your hosted backend URL:
```javascript
const API_BASE_URL = 'https://your-backend-domain.com/api';
```

---

## 🔒 Step 10: Handle Authentication

Create `src/context/AuthContext.js`:

```javascript
import React, { createContext, useState, useEffect } from 'react';
import { getStoredToken, getCurrentUser } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await getStoredToken();
      if (token) {
        const userData = await getCurrentUser();
        setUser(userData.data);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    await removeStoredToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## 📦 Step 11: Project Structure

```
OnixERP-Mobile/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── ProjectsScreen.js
│   │   ├── TasksScreen.js
│   │   └── ...
│   ├── components/
│   │   ├── ProjectCard.js
│   │   ├── TaskCard.js
│   │   └── ...
│   ├── services/
│   │   └── api.js
│   ├── navigation/
│   │   └── AppNavigator.js
│   ├── context/
│   │   └── AuthContext.js
│   └── utils/
│       └── helpers.js
├── App.js
└── package.json
```

---

## 🚀 Step 12: Run the App

### Using Expo:

```bash
# Start development server
npx expo start

# Scan QR code with:
# - Expo Go app (iOS/Android)
# - Or press 'a' for Android emulator
# - Or press 'i' for iOS simulator
```

### Using React Native CLI:

```bash
# Android
npx react-native run-android

# iOS (Mac only)
npx react-native run-ios
```

---

## ✅ Checklist

- [ ] React Native project created
- [ ] API service file created
- [ ] Login screen implemented
- [ ] Dashboard screen implemented
- [ ] Navigation configured
- [ ] Authentication working
- [ ] Backend connection tested
- [ ] App runs on device/emulator

---

## 🎯 Next Steps

1. **Implement Core Screens:**
   - Projects list and details
   - Tasks list and Kanban board
   - Client management
   - Profile settings

2. **Add Features:**
   - Push notifications
   - Offline support
   - File upload/download
   - Image picker for photos

3. **Testing:**
   - Test on real devices
   - Test on different screen sizes
   - Test network connectivity
   - Test authentication flow

4. **Build for Production:**
   - Configure app icons
   - Set up app signing
   - Build APK (Android) / IPA (iOS)
   - Submit to app stores

---

## 📚 Additional Resources

- **React Native Docs:** https://reactnative.dev
- **Expo Docs:** https://docs.expo.dev
- **React Navigation:** https://reactnavigation.org
- **Your Backend API:** Already ready! ✅

---

## 🎉 Summary

**Recommended:** React Native with Expo

**Why:**
- ✅ Same language as your web app
- ✅ Can reuse API code
- ✅ Faster development
- ✅ Your backend is already ready
- ✅ Easy to connect

**Your backend is 100% ready for mobile!** Just create the React Native app and connect using the API service code above.

---

**Ready to build your mobile app!** 🚀



