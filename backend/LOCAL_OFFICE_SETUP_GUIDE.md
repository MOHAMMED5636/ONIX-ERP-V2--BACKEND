# 🏢 Local Office Setup Guide - ONIX ERP

Complete guide to run the ONIX ERP application locally in your office premises.

---

## 📋 Prerequisites

### **Required Software:**

1. **Node.js** (v18 or higher)
   - Download: https://nodejs.org/
   - Verify: `node --version`

2. **PostgreSQL** (v14 or higher)
   - Download: https://www.postgresql.org/download/
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

3. **Git** (for cloning repository)
   - Download: https://git-scm.com/

4. **Code Editor** (VS Code recommended)
   - Download: https://code.visualstudio.com/

---

## 🗄️ Step 1: Setup PostgreSQL Database

### **Option A: Install PostgreSQL Locally**

1. **Download & Install PostgreSQL:**
   - Go to: https://www.postgresql.org/download/windows/
   - Install with default settings
   - Remember the password you set for `postgres` user

2. **Create Database:**
   ```sql
   -- Open pgAdmin or psql
   CREATE DATABASE onix_erp;
   CREATE USER onix_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE onix_erp TO onix_user;
   ```

### **Option B: Use Docker (Easier)**

```bash
# Run PostgreSQL in Docker
docker run --name onix-postgres \
  -e POSTGRES_DB=onix_erp \
  -e POSTGRES_USER=onix_user \
  -e POSTGRES_PASSWORD=onix123 \
  -p 5432:5432 \
  -d postgres:14

# Verify it's running
docker ps
```

---

## 🔧 Step 2: Setup Backend

### **2.1 Clone/Navigate to Backend**

```bash
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
```

### **2.2 Install Dependencies**

```bash
npm install
```

### **2.3 Create Environment File**

Create `.env` file in `backend/` directory:

```env
# Database
DATABASE_URL="postgresql://onix_user:onix123@localhost:5432/onix_erp?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Server
NODE_ENV="development"
PORT=3001

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3000"

# Email (Optional - for tender invitations)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### **2.4 Setup Database**

```bash
# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed database (creates admin and test users)
npm run db:seed
```

### **2.5 Start Backend Server**

```bash
# Development mode (with auto-reload)
npm run dev

# OR Production mode
npm run build
npm start
```

**Backend will run on:** `http://localhost:3001`

**Verify:** Open `http://localhost:3001/health` in browser - should return `{"status":"ok"}`

---

## 🎨 Step 3: Setup Frontend

### **3.1 Navigate to Frontend**

```bash
cd C:\Users\Lenovo\Desktop\ERP-FRONTEND\ONIX-ERP-V2
```

### **3.2 Install Dependencies**

```bash
npm install
```

### **3.3 Configure API URL**

Check `src/services/authAPI.js` or similar API files to ensure backend URL is:

```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

### **3.4 Start Frontend**

```bash
npm start
```

**Frontend will run on:** `http://localhost:3000`

---

## ✅ Step 4: Verify Setup

### **4.1 Check Backend**

1. Open browser: `http://localhost:3001/health`
2. Should see: `{"status":"ok","timestamp":"..."}`

### **4.2 Check Frontend**

1. Open browser: `http://localhost:3000`
2. Should see login page

### **4.3 Test Login**

**Default Admin Credentials:**
- Email: `admin@onixgroup.ae`
- Password: `admin123`
- Role: `ADMIN`

**Tender Engineer:**
- Email: `anas.ali@onixgroup.ae`
- Password: `anas@123`
- Role: `TENDER_ENGINEER`

---

## 🔐 Step 5: Default User Credentials

After running `npm run db:seed`, these users are created:

| Email | Password | Role |
|-------|----------|------|
| `admin@onixgroup.ae` | `admin123` | ADMIN |
| `engineer@onixgroup.ae` | `engineer@123` | TENDER_ENGINEER |
| `kaddour@onixgroup.ae` | `kaddour123` | ADMIN |
| `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN |
| `anas.ali@onixgroup.ae` | `anas@123` | TENDER_ENGINEER |

---

## 🖥️ Step 6: Run on Office Network

### **6.1 Find Your IP Address**

```bash
# Windows
ipconfig

# Look for IPv4 Address (e.g., 192.168.1.100)
```

### **6.2 Update CORS in Backend**

Edit `backend/src/app.ts`:

```typescript
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:3000',
  'http://192.168.1.100:3000', // Your office IP
  'http://192.168.1.101:3000', // Other office computers
  // Add more office IPs as needed
];
```

### **6.3 Access from Other Computers**

- **Backend:** `http://192.168.1.100:3001`
- **Frontend:** `http://192.168.1.100:3000`

**Note:** Make sure Windows Firewall allows connections on ports 3000 and 3001.

---

## 🚀 Quick Start Script

Create `start-local.bat` in backend folder:

```batch
@echo off
echo Starting ONIX ERP Backend...
echo.

echo 1. Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    pause
    exit /b 1
)

echo.
echo 2. Installing dependencies...
call npm install

echo.
echo 3. Generating Prisma Client...
call npx prisma generate

echo.
echo 4. Starting server...
call npm run dev

pause
```

Run: Double-click `start-local.bat`

---

## 📁 Project Structure

```
Onix-ERP-Backend/
├── backend/
│   ├── src/
│   │   ├── controllers/    # API controllers
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth, upload, etc.
│   │   ├── services/       # Email service
│   │   └── config/        # Database, env config
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── seed.ts        # Seed data
│   ├── uploads/           # Photo storage
│   ├── .env               # Environment variables
│   └── package.json
│
ERP-FRONTEND/
└── ONIX-ERP-V2/
    ├── src/
    │   ├── components/    # React components
    │   ├── pages/         # Page components
    │   ├── services/      # API services
    │   └── contexts/      # React contexts
    └── package.json
```

---

## 🔧 Troubleshooting

### **Issue: Port Already in Use**

```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### **Issue: Database Connection Error**

1. Check PostgreSQL is running:
   ```bash
   # Windows Services
   services.msc
   # Look for "postgresql-x64-14" service
   ```

2. Verify DATABASE_URL in `.env` is correct

3. Test connection:
   ```bash
   npx prisma db pull
   ```

### **Issue: Prisma Client Not Generated**

```bash
npx prisma generate
```

### **Issue: CORS Error**

- Check `FRONTEND_URL` in backend `.env`
- Verify CORS origins in `backend/src/app.ts`

### **Issue: Photos Not Showing**

- Check `backend/uploads/photos/` directory exists
- Verify static file serving in `backend/src/app.ts`
- Check photo URL in database

---

## 📝 Environment Variables Checklist

**Backend `.env` file must have:**

- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `JWT_SECRET` - Secret key for JWT tokens
- ✅ `JWT_EXPIRES_IN` - Token expiration (e.g., "7d")
- ✅ `NODE_ENV` - "development" or "production"
- ✅ `PORT` - Backend port (default: 3001)
- ✅ `FRONTEND_URL` - Frontend URL for CORS

**Optional:**
- `SMTP_HOST` - Email server
- `SMTP_PORT` - Email port
- `SMTP_USER` - Email username
- `SMTP_PASS` - Email password

---

## 🎯 Summary

**To run locally:**

1. ✅ Install Node.js & PostgreSQL
2. ✅ Setup database
3. ✅ Configure `.env` file
4. ✅ Run `npm install` in both backend and frontend
5. ✅ Run `npx prisma generate` and `npx prisma migrate dev` in backend
6. ✅ Run `npm run db:seed` to create default users
7. ✅ Start backend: `npm run dev`
8. ✅ Start frontend: `npm start`
9. ✅ Access: `http://localhost:3000`

**For office network access:**
- Use your computer's IP address instead of `localhost`
- Update CORS settings in backend
- Ensure firewall allows ports 3000 and 3001

---

**Your application is now ready to run locally!** 🚀



