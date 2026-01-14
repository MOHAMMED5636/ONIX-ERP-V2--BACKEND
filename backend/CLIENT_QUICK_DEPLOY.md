# ⚡ Quick Client Deployment - 15 Minutes

## 🎯 Fastest Way: Render + Vercel

### **Step 1: Deploy Backend (Render) - 5 min**

1. Go to: https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect GitHub: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`
4. Settings:
   ```
   Name: onix-erp-backend
   Root Directory: backend
   Build Command: npm install && npx prisma generate && npm run build
   Start Command: npm start
   ```
5. Add PostgreSQL database (click "New PostgreSQL")
6. Environment Variables:
   ```
   DATABASE_URL=<from-postgresql-service>
   JWT_SECRET=your-secret-key-here
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   PORT=10000
   FRONTEND_URL=https://your-frontend.vercel.app
   ```
7. Click "Create Web Service"
8. Wait for deployment → Get URL: `https://onix-erp-backend.onrender.com`

---

### **Step 2: Deploy Frontend (Vercel) - 5 min**

1. Go to: https://vercel.com
2. Click "Add New" → "Project"
3. Import GitHub repo: `your-frontend-repo`
4. Environment Variables:
   ```
   REACT_APP_API_URL=https://onix-erp-backend.onrender.com/api
   ```
5. Click "Deploy"
6. Get URL: `https://your-app.vercel.app`

---

### **Step 3: Update Backend CORS - 2 min**

1. Go back to Render dashboard
2. Update `FRONTEND_URL` to your Vercel URL
3. Redeploy backend

---

### **Step 4: Share with Client - 1 min**

**Send this to client:**

```
ONIX ERP Application - Test Access

URL: https://your-app.vercel.app

Test Credentials:
- Admin: admin@onixgroup.ae / admin123
- Engineer: anas.ali@onixgroup.ae / anas@123

Please test and provide feedback.
```

---

## ✅ Done!

**Total Time: ~15 minutes**

Client can now:
- ✅ Access application from anywhere
- ✅ Test all features
- ✅ Give feedback
- ✅ Review the application

---

## 🔧 Alternative: ngrok (5 minutes)

**For quick testing without deployment:**

1. Start backend: `npm run dev`
2. Start frontend: `npm start`
3. Download ngrok: https://ngrok.com/download
4. Run: `ngrok http 3000`
5. Share ngrok URL with client

**Note:** Free ngrok URLs expire after 2 hours.

---

**Render + Vercel is recommended for permanent client access!** 🚀





