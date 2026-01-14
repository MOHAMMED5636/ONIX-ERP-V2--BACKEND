# PowerShell script to find and kill process using port 3001

Write-Host "Checking for processes using port 3001..." -ForegroundColor Yellow

# Find process using port 3001
$port = netstat -ano | findstr :3001 | Select-String "LISTENING"

if ($port) {
    $pid = ($port -split '\s+')[-1]
    Write-Host "Found process $pid using port 3001" -ForegroundColor Red
    
    # Ask for confirmation
    $response = Read-Host "Kill process $pid? (Y/N)"
    
    if ($response -eq 'Y' -or $response -eq 'y') {
        taskkill /PID $pid /F
        Write-Host "Process $pid terminated successfully!" -ForegroundColor Green
        Write-Host "You can now start your server with: npm run dev" -ForegroundColor Green
    } else {
        Write-Host "Process not terminated. Please stop it manually or use a different port." -ForegroundColor Yellow
    }
} else {
    Write-Host "Port 3001 is free! You can start your server." -ForegroundColor Green
}



