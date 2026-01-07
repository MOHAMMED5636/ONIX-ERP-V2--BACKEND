# 🔧 Render "Cannot GET /" Fix

## ✅ Issue Fixed!

The "Cannot GET /" error on Render has been fixed by adding a root route handler.

---

## 🐛 The Problem

**Error on Render:**
```
Cannot GET /
```

**Cause:**
- No route handler for root path `/`
- Render tries to access root URL
- Express returns "Cannot GET /" error

---

## ✅ The Fix

Added a root route handler in `app.ts`:

```typescript
// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'ONIX ERP Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      docs: 'API documentation available at /api endpoints'
    },
    timestamp: new Date().toISOString()
  });
});
```

---

## 🚀 Deploy the Fix

### **Step 1: Commit Changes**

```bash
git add backend/src/app.ts
git commit -m "Add root route handler for Render deployment"
git push
```

### **Step 2: Render Auto-Deploy**

Render will automatically:
1. Detect the push
2. Build the application
3. Deploy the new version

### **Step 3: Verify**

After deployment, visit:
- `https://your-service.onrender.com/`
- Should show JSON response (not "Cannot GET /")
- `https://your-service.onrender.com/health`
- Should show: `{"status":"ok","timestamp":"..."}`

---

## ✅ Expected Response

**Before Fix:**
```
Cannot GET /
```

**After Fix:**
```json
{
  "message": "ONIX ERP Backend API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "health": "/health",
    "api": "/api",
    "docs": "API documentation available at /api endpoints"
  },
  "timestamp": "2026-01-02T10:55:00.000Z"
}
```

---

## 📝 Available Endpoints

After fix, these endpoints work:

| Endpoint | Description |
|----------|-------------|
| `/` | API welcome message |
| `/health` | Health check |
| `/api/auth/login` | Login endpoint |
| `/api/auth/me` | Get current user |
| `/api/dashboard/*` | Dashboard endpoints |
| `/api/employees/*` | Employee endpoints |
| `/uploads/photos/*` | Static photo files |

---

## 🔍 Test Endpoints

### **Root Route:**
```bash
curl https://your-service.onrender.com/
```

### **Health Check:**
```bash
curl https://your-service.onrender.com/health
```

### **API Login:**
```bash
curl -X POST https://your-service.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@onixgroup.ae","password":"admin123","role":"ADMIN"}'
```

---

**The root route is now handled! Commit and push to deploy the fix.** 🚀



