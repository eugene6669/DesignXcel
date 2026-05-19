# PowerShell script to add Railway IP range to Azure SQL Database firewall
# Usage: .\add-railway-firewall-rule.ps1 <resource-group>

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = ""
)

$ServerName = "designxcell-server"
$RuleName = "Railway-Production-Range"
$StartIP = "162.220.232.0"
$EndIP = "162.220.232.255"

if ([string]::IsNullOrEmpty($ResourceGroup)) {
    Write-Host "❌ Error: Resource group not provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage: .\add-railway-firewall-rule.ps1 -ResourceGroup <resource-group>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To find your resource group, run:" -ForegroundColor Yellow
    Write-Host "  az sql server show --name $ServerName --query resourceGroup -o tsv" -ForegroundColor Cyan
    exit 1
}

Write-Host "🔧 Adding Railway IP range to Azure SQL Database firewall..." -ForegroundColor Cyan
Write-Host "   Server: $ServerName"
Write-Host "   Resource Group: $ResourceGroup"
Write-Host "   Rule Name: $RuleName"
Write-Host "   IP Range: $StartIP - $EndIP"
Write-Host ""

# Check if Azure CLI is installed
try {
    $null = Get-Command az -ErrorAction Stop
} catch {
    Write-Host "❌ Error: Azure CLI is not installed" -ForegroundColor Red
    Write-Host "   Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    $null = az account show 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Not logged in"
    }
} catch {
    Write-Host "❌ Error: Not logged in to Azure CLI" -ForegroundColor Red
    Write-Host "   Run: az login" -ForegroundColor Yellow
    exit 1
}

# Add firewall rule
Write-Host "📝 Creating firewall rule..." -ForegroundColor Cyan
az sql server firewall-rule create `
  --resource-group $ResourceGroup `
  --server $ServerName `
  --name $RuleName `
  --start-ip-address $StartIP `
  --end-ip-address $EndIP

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Firewall rule created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ Wait 2-5 minutes for the change to propagate" -ForegroundColor Yellow
    Write-Host "🔄 Then restart your Railway service" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 To verify, check your Railway logs for:" -ForegroundColor Cyan
    Write-Host "   ✅ Connected to MSSQL database successfully" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Failed to create firewall rule" -ForegroundColor Red
    Write-Host "   Check the error message above" -ForegroundColor Yellow
    exit 1
}

