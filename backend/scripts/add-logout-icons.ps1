# Add SVG icons to logout buttons that don't have them
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")
$logoutSvg = "`n                    <svg width=`"18`" height=`"18`" viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"2`" stroke-linecap=`"round`" stroke-linejoin=`"round`">`n                        <path d=`"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4`"/><polyline points=`"16,17 21,12 16,7`"/><line x1=`"21`" y1=`"12`" x2=`"9`" y2=`"12`"/>`n                    </svg>`n                    "

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            
            # Check if logout button exists but doesn't have SVG
            if ($content -match '<a href="/logout" class="logout-button" onclick="handleLogout\(event\)">Logout</a>' -and $content -notmatch '<a href="/logout" class="logout-button" onclick="handleLogout\(event\)">\s*<svg') {
                $content = $content -replace '(<a href="/logout" class="logout-button" onclick="handleLogout\(event\)">)Logout</a>', "`$1$logoutSvg Logout</a>"
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Added logout icon to: $($file.Name)"
            }
        }
    }
}

Write-Host "Logout icons added!"

