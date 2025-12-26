# 📮 Postman API Testing Guide

## Base URL
```
http://localhost:3001
```

---

## 🔐 Authentication Endpoints

### 1. Health Check (No Auth Required)

**GET** `http://localhost:3001/health`

**Headers:**
- None required

**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-12-18T10:30:00.000Z"
}
```

---

### 2. Login (No Auth Required)

**POST** `http://localhost:3001/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "email": "admin@onixgroup.ae",
  "password": "admin123",
  "role": "ADMIN"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid-here",
      "email": "admin@onixgroup.ae",
      "firstName": "Admin",
      "lastName": "User",
      "role": "ADMIN"
    }
  }
}
```

**Other Test Users:**
```json
{
  "email": "engineer@onixgroup.ae",
  "password": "engineer@123",
  "role": "TENDER_ENGINEER"
}
```

**Error Responses:**
- `400` - Missing fields or invalid email format
- `401` - Invalid credentials
- `403` - Account deactivated

---

### 3. Get Current User (Auth Required)

**GET** `http://localhost:3001/api/auth/me`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
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

## 📋 Tender Endpoints

### 4. Assign Tender to Engineer (Admin Only)

**POST** `http://localhost:3001/api/tenders/assign`

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "tenderId": "tender-uuid-here",
  "engineerId": "engineer-uuid-here"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "uuid",
      "tenderId": "uuid",
      "engineerId": "uuid",
      "invitationToken": "inv_...",
      "status": "PENDING"
    },
    "invitationLink": "http://localhost:3000/tender/invitation/inv_..."
  }
}
```

**Error Responses:**
- `401` - Not authenticated
- `403` - Not admin
- `404` - Tender or Engineer not found

---

### 5. Get Invitation by Token (Public)

**GET** `http://localhost:3001/api/tenders/invitation/:token`

**Example:**
```
GET http://localhost:3001/api/tenders/invitation/inv_tender123_engineer456_1234567890_abc123
```

**Headers:**
- None required

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenderId": "uuid",
    "engineerId": "uuid",
    "invitationToken": "inv_...",
    "status": "PENDING",
    "tender": { ... },
    "engineer": { ... }
  }
}
```

**Error Responses:**
- `404` - Invitation not found

---

### 6. Accept Invitation (Engineer Only)

**POST** `http://localhost:3001/api/tenders/invitation/:token/accept`

**Example:**
```
POST http://localhost:3001/api/tenders/invitation/inv_tender123_engineer456_1234567890_abc123/accept
```

**Headers:**
```
Authorization: Bearer YOUR_ENGINEER_TOKEN_HERE
Content-Type: application/json
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitation accepted"
}
```

**Error Responses:**
- `401` - Not authenticated
- `403` - Not engineer or unauthorized
- `404` - Invitation not found
- `400` - Invitation already processed

---

## 📝 Postman Collection Setup

### Step 1: Create New Collection

1. Open Postman
2. Click **New** → **Collection**
3. Name it: **ONIX ERP Backend API**

### Step 2: Create Environment Variables

1. Click **Environments** (left sidebar)
2. Click **+** to create new environment
3. Name it: **ONIX ERP Local**
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:3001` | `http://localhost:3001` |
| `token` | (leave empty) | (leave empty) |

5. Click **Save**

### Step 3: Set Collection Base URL

1. Select your collection
2. Click **Variables** tab
3. Add variable:
   - Variable: `base_url`
   - Initial Value: `http://localhost:3001`
   - Current Value: `http://localhost:3001`
4. Save

### Step 4: Configure Login Request

1. Create request: **POST Login**
2. URL: `{{base_url}}/api/auth/login`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON):
   ```json
   {
     "email": "admin@onixgroup.ae",
     "password": "admin123",
     "role": "ADMIN"
   }
   ```
5. In **Tests** tab, add this script to save token:
   ```javascript
   if (pm.response.code === 200) {
       var jsonData = pm.response.json();
       pm.environment.set("token", jsonData.data.token);
       console.log("Token saved:", jsonData.data.token);
   }
   ```

### Step 5: Configure Authenticated Requests

For requests requiring authentication:

1. In **Authorization** tab:
   - Type: **Bearer Token**
   - Token: `{{token}}`

Or in **Headers** tab:
```
Authorization: Bearer {{token}}
```

---

## 🧪 Quick Test Sequence

### Test 1: Health Check
```
GET http://localhost:3001/health
```
Expected: `200 OK` with status message

### Test 2: Login
```
POST http://localhost:3001/api/auth/login
Body: {
  "email": "admin@onixgroup.ae",
  "password": "admin123",
  "role": "ADMIN"
}
```
Expected: `200 OK` with token

### Test 3: Get Current User (copy token from Test 2)
```
GET http://localhost:3001/api/auth/me
Headers: Authorization: Bearer YOUR_TOKEN
```
Expected: `200 OK` with user data

---

## 📋 Complete API Summary

| Method | Endpoint | Auth Required | Role Required |
|--------|----------|---------------|---------------|
| GET | `/health` | ❌ No | - |
| POST | `/api/auth/login` | ❌ No | - |
| GET | `/api/auth/me` | ✅ Yes | - |
| POST | `/api/tenders/assign` | ✅ Yes | ADMIN |
| GET | `/api/tenders/invitation/:token` | ❌ No | - |
| POST | `/api/tenders/invitation/:token/accept` | ✅ Yes | TENDER_ENGINEER |

---

## 🔑 Test Credentials

**Admin:**
- Email: `admin@onixgroup.ae`
- Password: `admin123`
- Role: `ADMIN`

**Tender Engineer:**
- Email: `engineer@onixgroup.ae`
- Password: `engineer@123`
- Role: `TENDER_ENGINEER`

---

## ⚠️ Notes

- All endpoints return JSON
- Token expires in 7 days (configurable in `.env`)
- Use `Bearer` token format for authenticated requests
- CORS is enabled for development
- Server must be running on port 3001

---

## 🐛 Troubleshooting

**401 Unauthorized:**
- Check if token is included in Authorization header
- Verify token format: `Bearer <token>` (with space)
- Token might be expired - login again

**404 Not Found:**
- Verify endpoint URL is correct
- Check if server is running
- Ensure base URL includes port 3001

**500 Internal Server Error:**
- Check server logs in terminal
- Verify database connection
- Check if required data exists

---

**Happy Testing! 🚀**







