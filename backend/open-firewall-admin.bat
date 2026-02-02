@echo off
:: Open Windows Firewall Ports for ONIX ERP
:: This script MUST be run as Administrator

echo ========================================
echo Opening Windows Firewall Ports
echo ========================================
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo Opening port 3001 (Backend)...
netsh advfirewall firewall add rule name="ONIX ERP Backend Port 3001" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Port 3001 opened successfully!
) else (
    echo [INFO] Port 3001 rule may already exist
)

echo.
echo Opening port 3000 (Frontend)...
netsh advfirewall firewall add rule name="ONIX ERP Frontend Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Port 3000 opened successfully!
) else (
    echo [INFO] Port 3000 rule may already exist
)

echo.
echo ========================================
echo Firewall Configuration Complete!
echo ========================================
echo.
echo Your Server IP: 192.168.1.178
echo Backend API: http://192.168.1.178:3001/api
echo Frontend: http://192.168.1.178:3000
echo.
echo Test from another computer:
echo http://192.168.1.178:3001/health
echo.
pause
