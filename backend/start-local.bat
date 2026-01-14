@echo off
echo ========================================
echo   ONIX ERP - Local Development Server
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Node.js...
node --version
echo.

echo [2/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)
echo.

echo [3/4] Generating Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo [ERROR] Failed to generate Prisma Client!
    pause
    exit /b 1
)
echo.

echo [4/4] Starting development server...
echo.
echo ========================================
echo   Server starting on http://localhost:3001
echo   Press Ctrl+C to stop the server
echo ========================================
echo.

call npm run dev

pause





