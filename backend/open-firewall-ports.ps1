# Open Windows Firewall Ports for ONIX ERP
# Run this script as Administrator

Write-Host "Opening Windows Firewall ports for ONIX ERP..." -ForegroundColor Green

# Open port 3001 (Backend)
try {
    New-NetFirewallRule -DisplayName "ONIX ERP Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -ErrorAction Stop
    Write-Host "✅ Port 3001 (Backend) opened successfully!" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "⚠️  Port 3001 rule already exists" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Error opening port 3001: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Open port 3000 (Frontend)
try {
    New-NetFirewallRule -DisplayName "ONIX ERP Frontend Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction Stop
    Write-Host "✅ Port 3000 (Frontend) opened successfully!" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "⚠️  Port 3000 rule already exists" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Error opening port 3000: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n✅ Firewall configuration complete!" -ForegroundColor Green
Write-Host "`nYour server IP: 192.168.1.178" -ForegroundColor Cyan
Write-Host "Backend URL: http://192.168.1.178:3001/api" -ForegroundColor Cyan
Write-Host "Frontend URL: http://192.168.1.178:3000" -ForegroundColor Cyan
Write-Host "`nTest from another computer: http://192.168.1.178:3001/health" -ForegroundColor Yellow
