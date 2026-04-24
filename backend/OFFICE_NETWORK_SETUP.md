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

### **Backend (already in code):**
✅ Listens on `0.0.0.0` so it accepts connections from the network  
✅ CORS **automatically** allows your machine’s current IP (e.g. when this PC is 192.168.1.151, `http://192.168.1.151:3000` and `http://192.168.1.151:3001` are allowed)  
✅ No need to hardcode 192.168.1.151 in backend — it uses the detected LAN IP

This allows:
- Frontend on this IP to access backend
- Other office computers to open the app and CORS to work

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

**Option A – Use .env (recommended for a fixed office IP)**  
In `ERP-FRONTEND/ONIX-ERP-V2/.env`:

```env
REACT_APP_API_URL=http://192.168.1.151:3001/api
REACT_APP_BACKEND_URL=http://192.168.1.151:3001
```

Then restart the frontend (`npm start`). All API and socket calls will use this backend.

**Option B – Open by IP (if your frontend uses dynamic API config)**  
If the frontend is built to use the same host as the page for the API, then **opening** `http://192.168.1.151:3000` from any device will make the app call `http://192.168.1.151:3001/api` automatically. No .env change needed.

**Check:** Ensure the frontend start script uses `HOST=0.0.0.0` so the dev server is reachable on the network (e.g. in `package.json`: `"start": "set HOST=0.0.0.0&& ... react-scripts start"`).

---

## 📝 Optional: Backend .env for Office URL

In `Onix-ERP-Backend/backend/.env` you can set:

```env
FRONTEND_URL=http://192.168.1.151:3000
```

This makes links in emails (e.g. password reset, tender invitations) use the office URL instead of localhost.

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

- [x] Backend listens on `0.0.0.0` and CORS uses detected IP
- [ ] Windows Firewall allows inbound TCP for ports **3000** and **3001**
- [ ] Backend running: `npm run dev` in backend folder
- [ ] Frontend running: `npm start` in frontend folder (with `HOST=0.0.0.0`)
- [ ] Frontend API: set `.env` to `http://192.168.1.151:3001/api` **or** open app via `http://192.168.1.151:3000` (if frontend uses dynamic API host)
- [ ] Test: open `http://192.168.1.151:3000` from this PC and from another office computer

---

## 🚨 Troubleshooting

### **Can't Access from Other Computers:**

1. **Check Firewall:**
   - Ensure ports 3000 and 3001 are allowed
   - Use PowerShell commands above

2. **Check Backend is Running:**
   - Verify: `http://192.168.1.151:3001/health`

3. **Check Frontend API URL:**
   - If using .env: ensure `REACT_APP_API_URL=http://192.168.1.151:3001/api` and restart frontend
   - If using dynamic config: open the app via `http://192.168.1.151:3000` (not localhost) so API uses the same host

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





