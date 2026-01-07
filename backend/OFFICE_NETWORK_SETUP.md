# 🏢 Office Network Setup - IP: 192.168.1.151

## ✅ Configuration Complete

Your application is now configured to work on your office network using IP: **192.168.1.151**

---

## 🌐 Access URLs

### **On This Computer (192.168.1.151):**
- **Frontend:** `http://192.168.1.151:3000`
- **Backend:** `http://192.168.1.151:3001`
- **Health Check:** `http://192.168.1.151:3001/health`

### **From Other Office Computers:**
- **Frontend:** `http://192.168.1.151:3000`
- **Backend:** `http://192.168.1.151:3001`

---

## 🔧 Configuration Applied

### **Backend CORS Updated:**
✅ Added `http://192.168.1.151:3000` to allowed origins
✅ Added `http://192.168.1.151:3001` to allowed origins

This allows:
- Frontend on this IP to access backend
- Other office computers to access the application
- CORS requests to work properly

---

## 🚀 How to Start

### **1. Start Backend:**
```bash
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npm run dev
```

Backend will run on: `http://192.168.1.151:3001`

### **2. Start Frontend:**
```bash
cd C:\Users\Lenovo\Desktop\ERP-FRONTEND\ONIX-ERP-V2
npm start
```

Frontend will run on: `http://192.168.1.151:3000`

---

## 🔥 Windows Firewall Configuration

### **Allow Ports 3000 and 3001:**

1. **Open Windows Firewall:**
   - Press `Win + R`
   - Type: `wf.msc`
   - Press Enter

2. **Create Inbound Rules:**
   - Click "Inbound Rules" → "New Rule"
   - Select "Port" → Next
   - Select "TCP"
   - Enter ports: `3000, 3001`
   - Allow the connection
   - Apply to all profiles
   - Name: "ONIX ERP Ports"

**OR Use PowerShell (Run as Administrator):**
```powershell
New-NetFirewallRule -DisplayName "ONIX ERP Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "ONIX ERP Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

---

## ✅ Testing

### **1. Test from This Computer:**
- Open: `http://192.168.1.151:3000`
- Should see login page

### **2. Test from Another Office Computer:**
- Open: `http://192.168.1.151:3000`
- Should see login page
- Should be able to login

### **3. Test Backend Health:**
- Open: `http://192.168.1.151:3001/health`
- Should see: `{"status":"ok"}`

---

## 📝 Frontend API Configuration

Make sure your frontend API service points to the correct backend URL.

**Check:** `ERP-FRONTEND/ONIX-ERP-V2/src/services/authAPI.js` or similar files

Should have:
```javascript
const API_BASE_URL = 'http://192.168.1.151:3001/api';
// OR use environment variable
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
```

**For office network, update to:**
```javascript
const API_BASE_URL = 'http://192.168.1.151:3001/api';
```

---

## 🔐 Default Login Credentials

| Email | Password | Role |
|-------|----------|------|
| `admin@onixgroup.ae` | `admin123` | ADMIN |
| `anas.ali@onixgroup.ae` | `anas@123` | TENDER_ENGINEER |
| `kaddour@onixgroup.ae` | `kaddour123` | ADMIN |
| `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN |

---

## 🎯 Quick Checklist

- [x] Backend CORS configured for `192.168.1.151`
- [ ] Windows Firewall allows ports 3000 and 3001
- [ ] Backend running on `http://192.168.1.151:3001`
- [ ] Frontend running on `http://192.168.1.151:3000`
- [ ] Frontend API URL points to `http://192.168.1.151:3001/api`
- [ ] Test access from another office computer

---

## 🚨 Troubleshooting

### **Can't Access from Other Computers:**

1. **Check Firewall:**
   - Ensure ports 3000 and 3001 are allowed
   - Use PowerShell commands above

2. **Check Backend is Running:**
   - Verify: `http://192.168.1.151:3001/health`

3. **Check Frontend API URL:**
   - Verify frontend points to `http://192.168.1.151:3001/api`

4. **Check Network:**
   - Ensure all computers are on same network (192.168.1.x)
   - Ping test: `ping 192.168.1.151`

---

## 📋 Summary

**Your application is configured for:**
- **IP Address:** 192.168.1.151
- **Frontend Port:** 3000
- **Backend Port:** 3001
- **Access URL:** `http://192.168.1.151:3000`

**Next Steps:**
1. Configure Windows Firewall (if not done)
2. Start backend: `npm run dev` in backend folder
3. Start frontend: `npm start` in frontend folder
4. Access from any office computer: `http://192.168.1.151:3000`

---

**Your office network setup is ready!** 🎉



