# Quick Start Guide - Backend Setup

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18+
   ```

2. **PostgreSQL** (v14 or higher)
   - Download: https://www.postgresql.org/download/
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`

3. **npm** or **yarn**

## Step 1: Install Dependencies

```bash
cd ONIX-ERP-V2/backend
npm install
```

## Step 2: Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and update:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `JWT_SECRET` - Generate a strong secret (min 32 characters)
   - `EMAIL_USER` and `EMAIL_PASS` - Your email credentials

## Step 3: Set Up Database

1. **Initialize Prisma:**
   ```bash
   npx prisma init
   ```

2. **Create the database:**
   ```sql
   -- Connect to PostgreSQL and run:
   CREATE DATABASE onix_erp;
   ```

3. **Run migrations:**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Seed the database (optional):**
   ```bash
   npm run db:seed
   ```

   This creates:
   - Admin user: `admin@onixgroup.ae` / `admin123`
   - Engineer user: `engineer@onixgroup.ae` / `engineer@123`

## Step 4: Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

The server will start on `http://localhost:3001`

## Step 5: Test the API

### Health Check
```bash
curl http://localhost:3001/health
```

### Login Test
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@onixgroup.ae",
    "password": "admin123",
    "role": "ADMIN"
  }'
```

You should receive a JWT token in the response.

## Step 6: Update Frontend

1. Create `.env` in `ONIX-ERP-V2/` (frontend root):
   ```env
   REACT_APP_API_URL=http://localhost:3001/api
   ```

2. Restart your React dev server:
   ```bash
   cd ..
   npm start
   ```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running: `pg_isready`
- Check `DATABASE_URL` in `.env`
- Ensure database exists: `psql -l` should list `onix_erp`

### Port Already in Use
- Change `PORT` in `.env` to a different port (e.g., 3002)
- Or kill the process using port 3001:
  ```bash
  # Windows
  netstat -ano | findstr :3001
  taskkill /PID <PID> /F
  
  # Mac/Linux
  lsof -ti:3001 | xargs kill
  ```

### Prisma Errors
- Regenerate Prisma Client: `npx prisma generate`
- Reset database (⚠️ deletes all data): `npx prisma migrate reset`

### Email Not Sending
- For Gmail: Enable 2FA and use App Password
- Check email credentials in `.env`
- Test with a simpler email service first

## Next Steps

1. Review `BACKEND_IMPLEMENTATION_GUIDE.md` for detailed implementation
2. Implement remaining API endpoints
3. Set up file upload functionality
4. Configure production environment

## Useful Commands

```bash
# View database in Prisma Studio
npm run prisma:studio

# Create new migration
npx prisma migrate dev --name migration_name

# Generate Prisma Client after schema changes
npm run prisma:generate

# Check database connection
npx prisma db pull
```

## Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Ensure PostgreSQL is running and accessible
4. Review the full implementation guide

