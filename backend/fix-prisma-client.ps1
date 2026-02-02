# Fix Prisma Client - Stop Node processes and regenerate
Write-Host "🔧 Fixing Prisma Client..." -ForegroundColor Cyan

# Step 1: Find and stop Node processes
Write-Host "`n📋 Finding Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Yellow
    foreach ($proc in $nodeProcesses) {
        Write-Host "  - Stopping process ID $($proc.Id)..." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✅ All Node.js processes stopped" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "✅ No Node.js processes found" -ForegroundColor Green
}

# Step 2: Regenerate Prisma Client
Write-Host "`n🔄 Regenerating Prisma Client..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Prisma Client regenerated successfully!" -ForegroundColor Green
    Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Restart your backend server: npm run dev" -ForegroundColor White
    Write-Host "   2. The TypeScript errors should now be resolved" -ForegroundColor White
} else {
    Write-Host "`n❌ Failed to regenerate Prisma Client" -ForegroundColor Red
    Write-Host "   Try closing VS Code/Cursor completely and run this script again" -ForegroundColor Yellow
}
