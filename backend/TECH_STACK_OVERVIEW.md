# ONIX ERP - Technology Stack Overview

## 🏗️ Full Stack Architecture

This is a **Full-Stack Enterprise ERP System** built with modern technologies.

---

## 🎨 Frontend Stack

### **Core Framework:**
- **React 18.2.0** - UI library
- **React Router DOM 6.30.1** - Routing
- **React Scripts 5.0.1** - Build tool (Create React App)

### **Styling:**
- **Tailwind CSS 3.3.3** - Utility-first CSS framework
- **Heroicons React 2.2.0** - Icon library
- **Radix UI** - Accessible component primitives
  - Dialog, Dropdown, Select, Tooltip, etc.

### **State Management:**
- **React Context API** - Global state (AuthContext, CompanySelectionContext)
- **React Hooks** - useState, useEffect, useContext

### **UI Components & Libraries:**
- **Framer Motion 12.23.12** - Animations
- **React Beautiful DND** - Drag and drop
- **TanStack React Table 8.21.3** - Data tables
- **React Date Range** - Date pickers
- **React Phone Input 2** - Phone number input

### **Internationalization:**
- **i18next 22.4.9** - Translation framework
- **react-i18next 12.3.1** - React bindings

### **Real-time Communication:**
- **Socket.IO Client 4.8.1** - WebSocket client

### **Other Frontend Tools:**
- **jsPDF 3.0.3** - PDF generation
- **Leaflet 1.9.4** - Maps
- **UUID 11.1.0** - Unique ID generation

---

## ⚙️ Backend Stack

### **Core Framework:**
- **Node.js** - Runtime environment
- **Express.js 4.18.2** - Web framework
- **TypeScript 5.3.3** - Type-safe JavaScript

### **Database:**
- **PostgreSQL** - Relational database
- **Prisma 5.7.1** - ORM (Object-Relational Mapping)
  - Type-safe database client
  - Database migrations
  - Schema management

### **Authentication & Security:**
- **JWT (JSON Web Tokens) 9.0.2** - Token-based authentication
- **bcryptjs 2.4.3** - Password hashing
- **Helmet 7.1.0** - Security headers
- **CORS 2.8.5** - Cross-origin resource sharing

### **API & Middleware:**
- **Express Validator 7.0.1** - Request validation
- **Morgan 1.10.0** - HTTP request logger
- **Multer 1.4.5** - File upload handling

### **Real-time Communication:**
- **Socket.IO 4.6.1** - WebSocket server

### **Email Service:**
- **Nodemailer 6.9.7** - Email sending

### **Development Tools:**
- **Nodemon 3.0.2** - Auto-restart on changes
- **ts-node 10.9.2** - TypeScript execution
- **ESLint** - Code linting
- **Prettier 3.1.1** - Code formatting

---

## 🗄️ Database Stack

### **Database:**
- **PostgreSQL** - Primary database
- **Schema Management:** Prisma Migrations

### **ORM:**
- **Prisma Client** - Type-safe database access
- **Prisma Studio** - Database GUI

### **Models:**
- User (with roles: ADMIN, HR, EMPLOYEE, PROJECT_MANAGER, TENDER_ENGINEER, CONTRACTOR)
- Client
- Project
- Tender
- Document
- ProjectAssignment
- TaskAssignment
- And more...

---

## 🔐 Authentication Stack

### **Method:**
- **JWT (JSON Web Tokens)** - Stateless authentication
- **Token Storage:** localStorage (frontend)
- **Password Hashing:** bcryptjs (10 salt rounds)

### **Flow:**
1. User logs in → Backend validates credentials
2. Backend generates JWT token
3. Token stored in localStorage
4. Token sent in Authorization header for API requests
5. Backend validates token on each request

---

## 📦 Project Structure

```
ONIX-ERP-Backend/
├── backend/              # Backend API
│   ├── src/
│   │   ├── controllers/ # Business logic
│   │   ├── routes/      # API routes
│   │   ├── middleware/  # Auth, validation, etc.
│   │   ├── services/    # External services
│   │   └── config/      # Configuration
│   └── prisma/          # Database schema & migrations
│
└── ERP-FRONTEND/
    └── ONIX-ERP-V2/     # Frontend React App
        ├── src/
        │   ├── components/  # Reusable components
        │   ├── modules/     # Feature modules
        │   ├── contexts/    # React contexts
        │   ├── services/    # API services
        │   └── layout/      # Layout components
```

---

## 🚀 Deployment Stack

### **Development:**
- **Frontend:** `npm start` → `http://localhost:3000`
- **Backend:** `npm run dev` → `http://localhost:3001`
- **Database:** PostgreSQL on `localhost:5432`

### **Build Tools:**
- **Frontend:** Create React App (Webpack)
- **Backend:** TypeScript Compiler (tsc)

---

## 🔧 Development Tools

### **Version Control:**
- Git

### **Package Managers:**
- **npm** - Node Package Manager

### **Code Quality:**
- **ESLint** - Linting
- **Prettier** - Formatting
- **TypeScript** - Type checking

### **Database Tools:**
- **Prisma Studio** - Database GUI
- **PostgreSQL** - Database client

---

## 📊 Stack Summary

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript |
| **UI Framework** | Tailwind CSS + Radix UI |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **Authentication** | JWT + bcryptjs |
| **Real-time** | Socket.IO |
| **Build Tool** | Create React App (Frontend) / TypeScript (Backend) |

---

## 🎯 Key Features Enabled by Stack

✅ **Type Safety:** TypeScript on both frontend & backend  
✅ **Modern UI:** React + Tailwind CSS  
✅ **Secure Auth:** JWT + Password Hashing  
✅ **Database:** PostgreSQL + Prisma ORM  
✅ **Real-time:** Socket.IO for live updates  
✅ **Scalable:** Express.js RESTful API  
✅ **Developer Experience:** Hot reload, TypeScript, ESLint  

---

## 📝 Technology Versions

### Frontend:
- React: `^18.2.0`
- React Router: `^6.30.1`
- Tailwind CSS: `^3.3.3`

### Backend:
- Node.js: (Latest LTS)
- Express: `^4.18.2`
- TypeScript: `^5.3.3`
- Prisma: `^5.7.1`

### Database:
- PostgreSQL: (Latest version)

---

**This is a modern, enterprise-grade full-stack application!** 🚀


