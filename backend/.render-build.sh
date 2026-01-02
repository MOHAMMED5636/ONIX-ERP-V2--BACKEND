#!/bin/bash
# Render build script for ONIX ERP Backend

echo "🔨 Starting build process..."

# Install dependencies (including devDependencies for TypeScript types)
echo "📦 Installing dependencies..."
# Use npm ci for faster, reliable builds, fallback to npm install
npm ci || npm install

# Build TypeScript
echo "🔧 Building TypeScript..."
npm run build

# Generate Prisma Client
echo "🗄️ Generating Prisma Client..."
npx prisma generate

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy || echo "⚠️ Migration failed or no migrations to run"

echo "✅ Build complete!"


