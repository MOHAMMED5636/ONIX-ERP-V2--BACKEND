@echo off
echo ========================================
echo Opening Windows Firewall Ports for ONIX ERP
echo ========================================
echo.
echo This script requires Administrator privileges!
echo.

powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0open-firewall-ports.ps1\"' -Verb RunAs"

pause
