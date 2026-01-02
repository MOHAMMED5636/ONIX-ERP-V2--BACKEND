# Database Setup Script for ONIX ERP Backend
# Run this script after PostgreSQL is installed and running

Write-Host "🗄️  ONIX ERP Database Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating it..." -ForegroundColor Yellow
    
    $dbPassword = Read-Host "Enter PostgreSQL password for user 'postgres'"
    
    @"
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:$dbPassword@localhost:5432/onix_erp?schema=public

JWT_SECRET=onix-erp-super-secret-jwt-key-2024-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=onix-erp-refresh-secret-key-2024
JWT_REFRESH_EXPIRES_IN=30d

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=noreply@onixgroup.ae

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png
"@ | Out-File -FilePath ".env" -Encoding utf8
    
    Write-Host "✅ .env file created" -ForegroundColor Green
}

# Step 1: Check PostgreSQL connection
Write-Host ""
Write-Host "Step 1: Checking PostgreSQL connection..." -ForegroundColor Yellow

try {
    $env:PGPASSWORD = (Get-Content .env | Select-String "DATABASE_URL").ToString().Split(":")[3].Split("@")[0]
    $result = & psql -U postgres -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL is accessible" -ForegroundColor Green
    } else {
        Write-Host "❌ Cannot connect to PostgreSQL" -ForegroundColor Red
        Write-Host "Please make sure PostgreSQL is installed and running" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "⚠️  psql command not found. Trying alternative method..." -ForegroundColor Yellow
}

# Step 2: Create database
Write-Host ""
Write-Host "Step 2: Creating database 'onix_erp'..." -ForegroundColor Yellow

try {
    $dbPassword = (Get-Content .env | Select-String "DATABASE_URL").ToString().Split(":")[3].Split("@")[0]
    $env:PGPASSWORD = $dbPassword
    & psql -U postgres -c "CREATE DATABASE onix_erp;" 2>&1 | Out-Null
    Write-Host "✅ Database created (or already exists)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not create database automatically" -ForegroundColor Yellow
    Write-Host "Please create it manually: CREATE DATABASE onix_erp;" -ForegroundColor Yellow
}

# Step 3: Generate Prisma Client
Write-Host ""
Write-Host "Step 3: Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma Client generated" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to generate Prisma Client" -ForegroundColor Red
    exit 1
}

# Step 4: Run migrations
Write-Host ""
Write-Host "Step 4: Running database migrations..." -ForegroundColor Yellow
npx prisma migrate dev --name init
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migrations completed" -ForegroundColor Green
} else {
    Write-Host "❌ Migrations failed" -ForegroundColor Red
    Write-Host "Check DATABASE_URL in .env file" -ForegroundColor Yellow
    exit 1
}

# Step 5: Seed database
Write-Host ""
Write-Host "Step 5: Seeding database with initial data..." -ForegroundColor Yellow
npm run db:seed
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database seeded successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Seeding failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Database setup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Test credentials:" -ForegroundColor Cyan
Write-Host "  Admin: admin@onixgroup.ae / admin123" -ForegroundColor White
Write-Host "  Engineer: engineer@onixgroup.ae / engineer@123" -ForegroundColor White
Write-Host ""
Write-Host "Start the server with: npm run dev" -ForegroundColor Cyan










