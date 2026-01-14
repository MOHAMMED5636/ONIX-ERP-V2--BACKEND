# ⚡ Quick Start - Run Locally in Office

## 🚀 Fast Setup (5 Minutes)

### **Step 1: Install PostgreSQL**

**Option A: Download & Install**
- Download: https://www.postgresql.org/download/windows/
- Install with default settings
- Remember the password you set

**Option B: Use Docker (Easier)**
```bash
docker run --name onix-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14
```

---

### **Step 2: Setup Backend**

```bash
# Navigate to backend
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend

# Install dependencies
npm install

# Create .env file (see below)

# Setup database
npx prisma generate
npx prisma migrate dev
npm run db:seed

# Start server
npm run dev
```

**Backend runs on:** `http://localhost:3001`

---

### **Step 3: Create `.env` File**

Create `backend/.env` file with:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/onix_erp?schema=public"
JWT_SECRET="your-secret-key-change-this"
JWT_EXPIRES_IN="7d"
NODE_ENV="development"
PORT=3001
FRONTEND_URL="http://localhost:3000"
```

**Note:** Replace `postgres:postgres` with your PostgreSQL username and password.

---

### **Step 4: Setup Frontend**

```bash
# Navigate to frontend
cd C:\Users\Lenovo\Desktop\ERP-FRONTEND\ONIX-ERP-V2

# Install dependencies
npm install

# Start frontend
npm start
```

**Frontend runs on:** `http://localhost:3000`

---

### **Step 5: Login**

Open browser: `http://localhost:3000`

**Default Credentials:**
- Email: `admin@onixgroup.ae`
- Password: `admin123`

---

## 🏢 For Office Network Access

### **Find Your IP:**
```bash
ipconfig
# Look for IPv4 Address (e.g., 192.168.1.100)
```

### **Update Backend CORS:**

Edit `backend/src/app.ts` - Add your IP to allowed origins:

```typescript
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.1.100:3000', // Your office IP
  // Add more office IPs
];
```

### **Access from Other Computers:**
- Backend: `http://192.168.1.100:3001`
- Frontend: `http://192.168.1.100:3000`

---

## ✅ Verify It's Working

1. **Backend Health Check:**
   - Open: `http://localhost:3001/health`
   - Should see: `{"status":"ok"}`

2. **Frontend:**
   - Open: `http://localhost:3000`
   - Should see login page

3. **Login Test:**
   - Use: `admin@onixgroup.ae` / `admin123`
   - Should redirect to dashboard

---

## 🔧 Common Issues

### **Port Already in Use:**
```bash
# Kill process on port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### **Database Connection Error:**
- Check PostgreSQL is running
- Verify DATABASE_URL in `.env`
- Check username/password

### **Prisma Errors:**
```bash
npx prisma generate
npx prisma migrate dev
```

---

**That's it! Your application is running locally!** 🎉





