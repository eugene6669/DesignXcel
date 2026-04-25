# PowerShell script to update all EJS sidebars with modern SVG icons for all roles

$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        Write-Host "`nUpdating $role pages..."
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            
            # Replace width="20" height="20" with class="sidebar-icon"
            $content = $content -replace 'width="20" height="20"', 'class="sidebar-icon"'
            
            # Replace width="18" height="18" in logout buttons
            $content = $content -replace 'width="18" height="18"', 'width="18" height="18"'
            
            # Add fonts if not present
            if ($content -notmatch 'fonts.googleapis.com') {
                $content = $content -replace '(<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">)', "`$1`n    <link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">`n    <link rel=`"preconnect`" href=`"https://fonts.gstatic.com`" crossorigin>`n    <link href=`"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap`" rel=`"stylesheet`">"
            }
            
            # Remove inline styles from submenus and labels
            $content = $content -replace 'style="display:block;"', ''
            $content = $content -replace 'style="font-weight:normal;"', ''
            
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "  Updated: $($file.Name)"
        }
        
        Write-Host "✓ $role sidebars updated!"
    } else {
        Write-Host "⚠ Path not found: $rolePath"
    }
}

Write-Host "`nAll sidebars updated successfully!"

