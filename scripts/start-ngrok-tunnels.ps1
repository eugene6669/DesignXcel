# Start DesignXcel ngrok tunnels (API :5000, web :3000)
# Requires: authtoken configured, backend + frontend already running

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root "ngrok.yml"

if (-not (Test-Path $config)) {
    Write-Error "Missing ngrok.yml at $config"
}

. "$PSScriptRoot\Resolve-Ngrok.ps1"

$ngrokExe = Resolve-NgrokExe
if (-not $ngrokExe) {
    Write-Host "ngrok not found. Install: winget install ngrok.ngrok" -ForegroundColor Yellow
    Write-Host "Then run: ngrok config add-authtoken YOUR_TOKEN"
    exit 1
}

Write-Host "Using ngrok: $ngrokExe" -ForegroundColor DarkGray
Write-Host "Starting tunnels: designxcel-api (5000), designxcel-web (3000)" -ForegroundColor Cyan
Write-Host "Inspector: http://127.0.0.1:4040"
Write-Host ""
Write-Host "After URLs appear, set frontend/.env.local:" -ForegroundColor Yellow
Write-Host "  REACT_APP_API_URL=https://<designxcel-api-https-url>"
Write-Host "  REACT_APP_WEBSOCKET_URL=https://<designxcel-api-https-url>"
Write-Host "Then restart: cd frontend; npm run dev"
Write-Host ""
Write-Host "Share the designxcel-web https URL with others."
Write-Host ""

Set-Location $root

# Merge global config (authtoken) with project tunnels — project-only --config skips auth
$userNgrokConfig = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
$ngrokArgs = @("start", "--config", $config, "designxcel-api", "designxcel-web")
if (Test-Path $userNgrokConfig) {
    $ngrokArgs = @("start", "--config", $userNgrokConfig, "--config", $config, "designxcel-api", "designxcel-web")
}

& $ngrokExe @ngrokArgs
