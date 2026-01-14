# 🛠️ Backend Technologies Stack

## Complete List of Technologies Used in ONIX ERP Backend

---

## 🎯 Core Framework & Runtime

### **Node.js**
- **Version:** 18+ (recommended)
- **Purpose:** JavaScript runtime environment
- **Why:** Server-side JavaScript execution

### **Express.js**
- **Version:** ^4.18.2
- **Purpose:** Web application framework
- **Why:** Fast, minimalist web framework for Node.js
- **Used for:** API routes, middleware, request handling

### **TypeScript**
- **Version:** ^5.3.3
- **Purpose:** Typed superset of JavaScript
- **Why:** Type safety, better IDE support, fewer bugs
- **Configuration:** `tsconfig.json`

---

## 🗄️ Database & ORM

### **PostgreSQL**
- **Version:** 14+ (recommended)
- **Purpose:** Relational database management system
- **Why:** Robust, feature-rich, open-source database
- **Connection:** Via Prisma ORM

### **Prisma**
- **Version:** ^5.7.1
- **Purpose:** Next-generation ORM (Object-Relational Mapping)
- **Why:** 
  - Type-safe database client
  - Auto-generated TypeScript types
  - Database migrations
  - Query builder
- **Components:**
  - `@prisma/client` - Database client
  - `prisma` - CLI tool
  - `schema.prisma` - Database schema definition

---

## 🔐 Authentication & Security

### **JSON Web Token (JWT)**
- **Package:** `jsonwebtoken` ^9.0.2
- **Purpose:** Token-based authentication
- **Why:** Stateless, secure authentication
- **Used for:** User login, API authentication

### **bcryptjs**
- **Version:** ^2.4.3
- **Purpose:** Password hashing
- **Why:** Secure password storage
- **Used for:** Hashing passwords before storing in database

### **Helmet**
- **Version:** ^7.1.0
- **Purpose:** Security middleware
- **Why:** Sets various HTTP headers for security
- **Protects against:** XSS, clickjacking, etc.

### **CORS (Cross-Origin Resource Sharing)**
- **Package:** `cors` ^2.8.5
- **Purpose:** Enable cross-origin requests
- **Why:** Allow frontend to access backend API
- **Configuration:** Configured in `app.ts`

---

## 📧 Email Services

### **Nodemailer**
- **Version:** ^6.9.7
- **Purpose:** Email sending service
- **Why:** Send emails (notifications, invitations, etc.)
- **Supports:** SMTP, Gmail, Outlook, etc.

---

## 📁 File Upload & Management

### **Multer**
- **Version:** ^1.4.5-lts.1
- **Purpose:** File upload middleware
- **Why:** Handle multipart/form-data for file uploads
- **Used for:** 
  - Profile photos
  - Document uploads
  - Project attachments
  - Task attachments

---

## 🔌 Real-time Communication

### **Socket.io**
- **Version:** ^4.6.1
- **Purpose:** Real-time bidirectional communication
- **Why:** WebSocket support for live updates
- **Used for:** Real-time notifications, chat features

---

## 🛡️ Validation & Sanitization

### **express-validator**
- **Version:** ^7.0.1
- **Purpose:** Input validation and sanitization
- **Why:** Validate and sanitize user input
- **Used for:** Request validation

---

## 📊 Logging & Monitoring

### **Morgan**
- **Version:** ^1.10.0
- **Purpose:** HTTP request logger middleware
- **Why:** Log all HTTP requests
- **Format:** 'dev' format (colored output)

---

## ⚙️ Development Tools

### **Nodemon**
- **Version:** ^3.0.2
- **Purpose:** Development server auto-restart
- **Why:** Automatically restart server on file changes
- **Used in:** `npm run dev` script

### **ts-node**
- **Version:** ^10.9.2
- **Purpose:** TypeScript execution for Node.js
- **Why:** Run TypeScript files directly without compilation
- **Used in:** Development scripts

### **ESLint**
- **Version:** ^8.56.0
- **Purpose:** Code linting
- **Why:** Find and fix code problems
- **Plugins:**
  - `@typescript-eslint/eslint-plugin` ^6.15.0
  - `@typescript-eslint/parser` ^6.15.0

### **Prettier**
- **Version:** ^3.1.1
- **Purpose:** Code formatter
- **Why:** Consistent code formatting

---

## 📦 Environment & Configuration

### **dotenv**
- **Version:** ^16.3.1
- **Purpose:** Environment variable management
- **Why:** Load environment variables from `.env` file
- **Used for:** Database URLs, secrets, API keys

---

## 📚 Type Definitions

All TypeScript type definitions are included:
- `@types/express` ^4.17.21
- `@types/node` ^20.10.5
- `@types/bcryptjs` ^2.4.6
- `@types/cors` ^2.8.17
- `@types/jsonwebtoken` ^9.0.5
- `@types/morgan` ^1.9.9
- `@types/multer` ^1.4.11
- `@types/nodemailer` ^6.4.14

---

## 🏗️ Architecture Pattern

### **MVC (Model-View-Controller)**
- **Models:** Prisma schema models
- **Views:** JSON API responses
- **Controllers:** Request handlers in `src/controllers/`

### **Layered Architecture**
```
src/
├── config/       # Configuration files
├── controllers/  # Business logic handlers
├── middleware/   # Express middleware
├── routes/       # API route definitions
├── services/     # Business services
└── utils/        # Utility functions
```

---

## 🔄 API Architecture

### **RESTful API**
- **Method:** REST (Representational State Transfer)
- **Format:** JSON
- **Authentication:** JWT Bearer tokens
- **Error Handling:** Centralized error middleware

### **API Structure:**
```
/api
├── /auth          # Authentication endpoints
├── /projects      # Project management
├── /tasks         # Task management
├── /clients       # Client management
├── /tenders       # Tender management
├── /employees     # Employee management
├── /dashboard     # Dashboard data
└── /documents     # Document management
```

---

## 🗂️ Database Models

### **Core Models:**
- `User` - User accounts and authentication
- `Client` - Client/customer information
- `Project` - Project management
- `Task` - Task management
- `Tender` - Tender management
- `Document` - Document storage
- `ProjectChecklist` - Project checklist items
- `TaskChecklist` - Task checklist items
- `ProjectAttachment` - Project file attachments
- `TaskAttachment` - Task file attachments
- `TaskComment` - Task comments
- `TaskAssignment` - Task assignments
- `ProjectAssignment` - Project assignments

---

## 🚀 Build & Deployment

### **Build Process:**
1. TypeScript compilation (`tsc`)
2. Prisma client generation
3. Production build

### **Scripts:**
- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run db:seed` - Seed database with test data

---

## 🌐 Network & Deployment

### **Server Configuration:**
- **Host:** `0.0.0.0` (all network interfaces)
- **Port:** Configurable via `PORT` env variable (default: 3001)
- **CORS:** Configured for cross-origin requests
- **Static Files:** Served from `/uploads` directory

---

## 📋 Technology Summary Table

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Runtime** | Node.js | 18+ | JavaScript runtime |
| **Framework** | Express.js | ^4.18.2 | Web framework |
| **Language** | TypeScript | ^5.3.3 | Type-safe JavaScript |
| **Database** | PostgreSQL | 14+ | Relational database |
| **ORM** | Prisma | ^5.7.1 | Database toolkit |
| **Auth** | JWT | ^9.0.2 | Token authentication |
| **Security** | Helmet | ^7.1.0 | Security headers |
| **CORS** | cors | ^2.8.5 | Cross-origin requests |
| **Password** | bcryptjs | ^2.4.3 | Password hashing |
| **Email** | Nodemailer | ^6.9.7 | Email sending |
| **Upload** | Multer | ^1.4.5 | File uploads |
| **Real-time** | Socket.io | ^4.6.1 | WebSocket support |
| **Validation** | express-validator | ^7.0.1 | Input validation |
| **Logging** | Morgan | ^1.10.0 | HTTP logging |
| **Dev Tool** | Nodemon | ^3.0.2 | Auto-restart |
| **Config** | dotenv | ^16.3.1 | Environment variables |

---

## 🎯 Why These Technologies?

### **Node.js + Express:**
- ✅ Fast and scalable
- ✅ Large ecosystem
- ✅ JavaScript everywhere (frontend + backend)
- ✅ Great for REST APIs

### **TypeScript:**
- ✅ Type safety catches errors early
- ✅ Better IDE support
- ✅ Easier refactoring
- ✅ Self-documenting code

### **Prisma:**
- ✅ Type-safe database queries
- ✅ Auto-generated types
- ✅ Easy migrations
- ✅ Great developer experience

### **PostgreSQL:**
- ✅ Robust and reliable
- ✅ ACID compliant
- ✅ Great for complex data
- ✅ Open source

### **JWT:**
- ✅ Stateless authentication
- ✅ Scalable
- ✅ Works with mobile apps
- ✅ Industry standard

---

## 📖 Learning Resources

### **Official Documentation:**
- [Node.js](https://nodejs.org/docs)
- [Express.js](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Prisma](https://www.prisma.io/docs)
- [PostgreSQL](https://www.postgresql.org/docs/)

---

## ✅ Technology Stack Summary

**Backend Stack:**
```
Node.js + Express.js + TypeScript
    ↓
Prisma ORM + PostgreSQL
    ↓
JWT Authentication + Security Middleware
    ↓
RESTful API + File Upload + Email Service
```

**This is a modern, production-ready backend stack!** 🚀

---

**Last Updated:** Based on `package.json` and current implementation
**Total Dependencies:** 12 production + 11 development



