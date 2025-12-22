# ONIX ERP Backend API

Backend API server for the ONIX ERP System built with Node.js, Express, TypeScript, and Prisma.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database credentials and other settings.

3. **Set up database:**
   ```bash
   # Initialize Prisma
   npx prisma generate
   
   # Run migrations
   npm run prisma:migrate
   
   # Seed database (creates admin and engineer users)
   npm run db:seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3001`

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Database seed script
├── uploads/             # File upload directory
└── dist/                # Compiled JavaScript (generated)
```

## 🔑 Default Users

After seeding, you can login with:

- **Admin:**
  - Email: `admin@onixgroup.ae`
  - Password: `admin123`
  - Role: `ADMIN`

- **Tender Engineer:**
  - Email: `engineer@onixgroup.ae`
  - Password: `engineer@123`
  - Role: `TENDER_ENGINEER`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user (requires auth)

### Tenders
- `POST /api/tenders/assign` - Assign tender to engineer (Admin only)
- `GET /api/tenders/invitation/:token` - Get invitation by token
- `POST /api/tenders/invitation/:token/accept` - Accept invitation (Engineer)

### Health Check
- `GET /health` - Server health check

## 🛠️ Available Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)
- `npm run db:seed` - Seed database with initial data

## 📚 Documentation

- See `BACKEND_IMPLEMENTATION_GUIDE.md` for detailed implementation guide
- See `QUICK_START.md` for quick setup instructions

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control (RBAC)
- CORS enabled for frontend
- Helmet.js for security headers

## 📝 Environment Variables

See `.env.example` for all required environment variables.

## 🐛 Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Ensure database exists: `CREATE DATABASE onix_erp;`

### Port Already in Use
- Change `PORT` in `.env`
- Or kill the process using the port

### Prisma Errors
- Run `npx prisma generate` to regenerate client
- Check database connection
- Verify schema.prisma syntax

## 📦 Dependencies

See `package.json` for full list of dependencies.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

ISC

