# Run ngrok without adding it to PATH. Usage: .\scripts\ngrok.ps1 http 5000
# Or start both tunnels: .\scripts\start-ngrok-tunnels.ps1

. "$PSScriptRoot\Resolve-Ngrok.ps1"

$ngrokExe = Resolve-NgrokExe
if (-not $ngrokExe) {
    Write-Host "ngrok not found. Install: winget install ngrok.ngrok" -ForegroundColor Yellow
    exit 1
}

if ($args.Count -eq 0) {
    Write-Host "Usage: .\scripts\ngrok.ps1 <ngrok args...>" -ForegroundColor Yellow
    Write-Host "Example: .\scripts\ngrok.ps1 http 5000"
    Write-Host "Tunnels:  .\scripts\start-ngrok-tunnels.ps1"
    exit 1
}

& $ngrokExe @args
