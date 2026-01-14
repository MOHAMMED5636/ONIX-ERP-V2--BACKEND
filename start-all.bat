@echo off
title ERP System Startup
color 0A

echo ========================================
echo   ERP System - Starting Services
echo ========================================
echo.

echo [1/2] Starting Backend Server...
start "ERP Backend" cmd /k "cd backend && echo Backend starting on http://192.168.1.151:3001 && npm run dev"

timeout /t 5 /nobreak >nul

echo [2/2] Starting Frontend Server...
start "ERP Frontend" cmd /k "cd frontend && echo Frontend starting on http://192.168.1.151:3000 && npm run dev -- --host 0.0.0.0"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   Services Started Successfully!
echo ========================================
echo.
echo Backend API:  http://192.168.1.151:3001/api
echo Frontend:     http://192.168.1.151:3000
echo.
echo Share these URLs with clients on your network:
echo   - Frontend: http://192.168.1.151:3000
echo.
echo Press any key to close this window...
echo (Services will continue running in separate windows)
pause >nul



